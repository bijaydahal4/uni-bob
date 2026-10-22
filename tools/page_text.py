#!/usr/bin/env python3
"""Read a web page as plain text so facts can be checked against the page itself.

Usage:
  python3 tools/page_text.py URL                      quick fetch (no JavaScript)
  .venv/bin/python tools/page_text.py --browser URL   real headless browser (JavaScript pages, UCAS)

Options:
  --find REGEX    only print lines matching REGEX (case-insensitive) with 2 lines of context
  --context N     lines of context for --find (default 2)
  --links         also print the page's links as "text -> url"
  --save FILE     save the full text to FILE as well
  --wait MS       extra wait after load in browser mode (default 2500)
  --max-age DAYS  reuse the shared cached copy if fetched within DAYS days (default 7; 0 = always fetch)
  --no-cache      bypass the shared cache (used internally)
  --json-out FILE write {status, final, title, text, links} as JSON (used by tools/pagecache.py)

Pages are cached in research/cache/ (see tools/pagecache.py), so asking for the same page twice costs nothing.

The first lines of output are: status, final URL and page title.
Hidden content (accordions, tabs) is included, because entry requirements often sit inside them.
"""
import argparse
import gzip
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from html_text import text_from_html  # noqa: E402

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")

# Walks the DOM (including hidden nodes) and keeps block structure as new lines.
JS_TEXT = r"""
() => {
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','TEMPLATE','IFRAME']);
  const BLOCK = new Set(['P','DIV','LI','TR','H1','H2','H3','H4','H5','H6','BR','SECTION','ARTICLE',
    'HEADER','FOOTER','TD','TH','DT','DD','TABLE','UL','OL','MAIN','ASIDE','NAV','SUMMARY','DETAILS',
    'OPTION','LABEL','BUTTON','FIGCAPTION','BLOCKQUOTE','DL']);
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(n.nodeValue); return; }
    if (n.nodeType !== 1 || SKIP.has(n.tagName)) return;
    const b = BLOCK.has(n.tagName);
    if (b) out.push('\n');
    if (n.tagName === 'TD' || n.tagName === 'TH') out.push(' | ');
    if (n.shadowRoot) for (const c of n.shadowRoot.childNodes) walk(c);
    for (const c of n.childNodes) walk(c);
    if (b) out.push('\n');
  };
  walk(document.body);
  return out.join('');
}
"""

JS_LINKS = r"""
() => Array.from(document.querySelectorAll('a[href]')).map(a => [
  (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim(), a.href])
"""


def clean(s):
    s = re.sub(r"[ \t\r\f\v ​]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return "\n".join(l.strip() for l in s.split("\n") if l.strip())


def fetch_plain(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9",
                                               "Accept-Encoding": "gzip, deflate"})
    with urllib.request.urlopen(req, timeout=40) as r:
        body = r.read()
        enc = (r.headers.get("Content-Encoding") or "").lower()
        if enc == "gzip" or body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
        elif enc == "deflate":
            body = zlib.decompress(body, -zlib.MAX_WBITS) if body[:1] != b"x" else zlib.decompress(body)
        html = body.decode(r.headers.get_content_charset() or "utf-8", "replace")
        status, final = r.status, r.geturl()
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    title = clean(title.group(1)) if title else ""
    links = []
    for href, txt in re.findall(r'<a\s[^>]*href="([^"#][^"]*)"[^>]*>(.*?)</a>', html, re.S | re.I):
        links.append([clean(re.sub(r"<[^>]+>", " ", txt)), urllib.parse.urljoin(final, href)])
    return status, final, title, text_from_html(html), links


def fetch_browser(url, wait_ms):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(user_agent=UA, locale="en-GB", viewport={"width": 1280, "height": 1600})
        page = ctx.new_page()
        resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
        try:
            page.wait_for_load_state("networkidle", timeout=12000)
        except Exception:
            pass
        page.wait_for_timeout(wait_ms)
        status = resp.status if resp else 0
        text = clean(page.evaluate(JS_TEXT))
        links = page.evaluate(JS_LINKS)
        out = (status, page.url, page.title(), text, links)
        browser.close()
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--browser", action="store_true")
    ap.add_argument("--find")
    ap.add_argument("--context", type=int, default=2)
    ap.add_argument("--links", action="store_true")
    ap.add_argument("--save")
    ap.add_argument("--wait", type=int, default=2500)
    ap.add_argument("--max-age", type=float, default=7)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--json-out")
    a = ap.parse_args()
    how = "fetched"
    if a.no_cache:
        try:
            status, final, title, text, links = (fetch_browser(a.url, a.wait) if a.browser else fetch_plain(a.url))
        except Exception as e:  # report and exit non-zero so callers can switch method
            print(f"ERROR fetching {a.url}: {e}")
            sys.exit(2)
    else:
        import pagecache
        meta = pagecache.meta_of(a.url)
        max_age = a.max_age
        if meta and ((a.browser and meta.get("method") == "plain") or (a.links and "links" not in meta)):
            max_age = 0  # need a richer copy than the cached one
        text, meta, how = pagecache.get(a.url, max_age, browser="always" if a.browser else "auto")
        if text is None:
            print(f"ERROR fetching {a.url}: {how}")
            print("Tip: the page may be blocked to scripts; try the UCAS course page or record it as notConfirmed.")
            sys.exit(2)
        status, final, title, links = meta.get("status"), meta.get("final"), meta.get("title"), meta.get("links") or []
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump({"status": status, "final": final, "title": title, "text": text, "links": links}, f)
        return
    print(f"STATUS: {status}\nURL: {final}\nTITLE: {title}\nSOURCE: {how}\n" + "-" * 60)
    if a.save:
        with open(a.save, "w", encoding="utf-8") as f:
            f.write(f"URL: {final}\nTITLE: {title}\n\n{text}\n")
    if a.find:
        rx = re.compile(a.find, re.I)
        lines = text.split("\n")
        keep = set()
        for i, l in enumerate(lines):
            if rx.search(l):
                keep.update(range(max(0, i - a.context), min(len(lines), i + a.context + 1)))
        last = -2
        for i in sorted(keep):
            if i != last + 1:
                print("...")
            print(lines[i])
            last = i
        if not keep:
            print(f"(no lines matched /{a.find}/ — {len(lines)} lines on page)")
    elif not a.links:
        print(text)
    if a.links:
        print("-" * 60 + "\nLINKS:")
        seen = set()
        for t, h in links:
            if h in seen or not h.startswith("http"):
                continue
            seen.add(h)
            print(f"{t[:80]} -> {h}")


if __name__ == "__main__":
    main()
