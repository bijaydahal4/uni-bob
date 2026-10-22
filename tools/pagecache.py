#!/usr/bin/env python3
"""One shared cache of official pages, so each URL is fetched once and reused by every research tool.

- Each page is stored as research/cache/pages/<key>.txt (the page text) and <key>.json (url, final url,
  title, fetched time, method, status, content hash). One file pair per URL, so parallel agents never clash.
- get(url, max_age_days) returns the cached copy if it is fresh enough, otherwise fetches it (plain request
  first, then a headless browser for JavaScript pages) and stores it.
- URLs are normalised (no #fragment, no tracking parameters, no trailing slash, "www." ignored) so the same
  page is never stored twice under slightly different addresses.

Command line:
  python3 tools/pagecache.py import            add pages already saved under research/tmp/ (no re-fetching)
  python3 tools/pagecache.py stats             how many pages, by site and age
  python3 tools/pagecache.py get URL [--max-age DAYS]
  python3 tools/pagecache.py purge-binary      drop cached copies that are unreadable (undecoded gzip etc.)
  python3 tools/pagecache.py show URL [120-180] [--grep REGEX]   print part of a cached page with line numbers
  python3 tools/pagecache.py put URL FILE      store text read another way (e.g. in the browser pane)
"""
import datetime as dt
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = os.path.join(ROOT, "research", "cache", "pages")
VENV_PY = os.path.join(ROOT, ".venv", "bin", "python")
MIN_CHARS = 1500  # anything shorter is treated as a failed/blocked load


def looks_binary(text):
    """Compressed or binary content that slipped through (e.g. an undecoded gzip body)."""
    sample = (text or "")[:4000]
    bad = sum(1 for ch in sample if ch == "\ufffd" or (ord(ch) < 32 and ch not in "\n\r\t"))
    return bool(sample) and bad / len(sample) > 0.05
DEFAULT_MAX_AGE = 7  # days; research reuses a page fetched within the last week

TRACKING = re.compile(r"^(utm_|gclid$|fbclid$|mc_|_ga$|_gl$|hsCtaTracking$)", re.I)
MULTI_SUFFIX = (".ac.uk", ".co.uk", ".org.uk", ".gov.uk", ".nhs.uk", ".ltd.uk", ".me.uk")


def norm_url(url):
    """Canonical form used as the cache key and for de-duplication."""
    p = urllib.parse.urlsplit((url or "").strip())
    host = p.netloc.lower()
    host = host[4:] if host.startswith("www.") else host
    host = re.sub(r":(80|443)$", "", host)
    path = re.sub(r"/+$", "", p.path) or "/"
    query = sorted((k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k))
    return urllib.parse.urlunsplit(("https", host, path, urllib.parse.urlencode(query), ""))


def site_of(url):
    """Registrable site, e.g. https://www.bath.ac.uk/x → bath.ac.uk; digital.ucas.com → ucas.com."""
    host = urllib.parse.urlsplit(url or "").netloc.lower().split(":")[0]
    if not host:
        return ""
    parts = host.split(".")
    n = 3 if host.endswith(MULTI_SUFFIX) else 2
    return ".".join(parts[-n:])


def key_of(url):
    return hashlib.sha1(norm_url(url).encode()).hexdigest()[:20]


def _paths(url):
    k = key_of(url)
    return os.path.join(PAGES, k + ".txt"), os.path.join(PAGES, k + ".json")


def _now():
    return dt.datetime.now().replace(microsecond=0)


def _write(url, final, title, text, method, status, fetched=None, links=None):
    os.makedirs(PAGES, exist_ok=True)
    meta = {"url": url, "norm": norm_url(url), "final": final or url, "title": title or "", "method": method,
            "status": status, "fetched": (fetched or _now()).isoformat(), "chars": len(text),
            "hash": hashlib.sha256(re.sub(r"\s+", " ", text.lower()).encode()).hexdigest()[:20]}
    if links is not None:
        meta["links"] = links[:600]
    tp, mp = _paths(url)
    for path, content in ((tp, f"URL: {meta['final']}\nTITLE: {meta['title']}\n\n{text}\n"), (mp, json.dumps(meta, indent=1))):
        tmp = f"{path}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, path)
    # A redirect target gets its own entry pointing at the same text, so either address hits the cache.
    if final and norm_url(final) != norm_url(url) and not os.path.exists(_paths(final)[1]):
        _write(final, final, title, text, method, status, fetched, links)
    return meta


def meta_of(url):
    mp = _paths(url)[1]
    if os.path.exists(mp):
        try:
            return json.load(open(mp, encoding="utf-8"))
        except (OSError, ValueError):
            return None
    return None


def age_days(meta):
    try:
        return (_now() - dt.datetime.fromisoformat(meta["fetched"])).total_seconds() / 86400
    except (KeyError, ValueError, TypeError):
        return 1e9


def _body(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    return text.split("\n\n", 1)[1] if text.startswith("URL:") and "\n\n" in text else text


def fetch_pdf(url):
    """PDFs (e.g. official course lists) are converted to text with pypdf in the project's venv."""
    py = VENV_PY if os.path.exists(VENV_PY) else sys.executable
    code = ("import io,sys,urllib.request,pypdf;"
            "r=urllib.request.urlopen(urllib.request.Request(sys.argv[1],headers={'User-Agent':'Mozilla/5.0'}),timeout=60);"
            "d=pypdf.PdfReader(io.BytesIO(r.read()));"
            "print('\\n'.join((p.extract_text() or '') for p in d.pages))")
    r = subprocess.run([py, "-c", code, url], capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise RuntimeError((r.stderr.strip().splitlines() or ["PDF fetch failed"])[-1][:200])
    return 200, url, url.rsplit("/", 1)[-1], r.stdout, []


def fetch_plain(url):
    if re.search(r"\.pdf($|\?)", url, re.I):
        return fetch_pdf(url)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from page_text import fetch_plain as fp  # noqa: E402
    return fp(url)  # (status, final, title, text, links)


def fetch_browser(url):
    """Headless browser in the project's venv (Playwright). Returns (status, final, title, text, links)."""
    os.makedirs(PAGES, exist_ok=True)
    out = os.path.join(PAGES, f"_browser_{os.getpid()}_{key_of(url)}.json")
    py = VENV_PY if os.path.exists(VENV_PY) else sys.executable
    r = subprocess.run([py, os.path.join(ROOT, "tools", "page_text.py"), "--browser", "--no-cache", url, "--json-out", out],
                       capture_output=True, text=True, timeout=180)
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError(((r.stdout or r.stderr or "browser fetch failed").strip().splitlines() or ["browser fetch failed"])[0][:200])
    d = json.load(open(out, encoding="utf-8"))
    os.remove(out)
    return d["status"], d["final"], d["title"], d["text"], d.get("links") or []


def get(url, max_age_days=DEFAULT_MAX_AGE, browser="auto"):
    """Return (text, meta, how) where how is 'cache', 'plain', 'browser' or 'failed: …'.

    browser: 'auto' (plain first, browser if the plain page is blocked/empty), 'always', or 'never'.
    """
    meta = meta_of(url)
    if meta and meta.get("chars", 0) >= MIN_CHARS and age_days(meta) <= max_age_days and not meta.get("binary"):
        return _body(_paths(url)[0]), meta, "cache"
    errors = []
    if browser == "auto" and meta and meta.get("method") == "browser":
        browser = "always"  # this page needed a real browser before (script-loaded content); keep using one
    modes = {"auto": ("plain", "browser"), "always": ("browser",), "never": ("plain",)}[browser]
    for mode in modes:
        try:
            status, final, title, text, links = fetch_plain(url) if mode == "plain" else fetch_browser(url)
        except Exception as e:  # blocked, timeout, DNS…
            errors.append(f"{mode}: {str(e)[:120]}")
            continue
        if status and status >= 400:
            errors.append(f"{mode}: HTTP {status}")
            continue
        if len(text) < MIN_CHARS:
            errors.append(f"{mode}: only {len(text)} characters (blocked or empty)")
            continue
        if looks_binary(text):
            errors.append(f"{mode}: unreadable (binary) content")
            continue
        meta = _write(url, final, title, text, mode, status, links=links)
        return text, meta, mode
    if meta and meta.get("chars", 0) >= MIN_CHARS:  # stale copy is better than nothing; caller sees its age
        return _body(_paths(url)[0]), meta, f"stale ({age_days(meta):.0f} days old; refetch failed)"
    return None, None, "failed: " + "; ".join(errors)


def import_saved(paths=None):
    """Add pages already saved by earlier research (page_text --save files) without fetching them again."""
    paths = paths or [p for p in glob.glob(os.path.join(ROOT, "research", "tmp", "**", "*"), recursive=True)
                      if os.path.isfile(p) and not p.endswith((".py", ".png", ".json", ".md", ".html"))]
    added = skipped = 0
    for p in paths:
        try:
            raw = open(p, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        m = re.search(r"^URL: (\S+)", raw[:800], re.M)
        if not m:
            continue
        url = m.group(1)
        title = (re.search(r"^TITLE: (.*)$", raw[:800], re.M) or [None, ""])[1]
        body = raw.split("-" * 60, 1)[1] if ("-" * 60) in raw[:1200] else (raw.split("\n\n", 1)[1] if "\n\n" in raw else raw)
        body = body.strip()
        old = meta_of(url)
        if len(body) < MIN_CHARS or (old and old.get("chars", 0) >= len(body)):
            skipped += 1
            continue
        fetched = dt.datetime.fromtimestamp(os.path.getmtime(p)).replace(microsecond=0)
        _write(url, url, title, body, "imported", 200, fetched)
        added += 1
    return added, skipped


def stats():
    metas = [json.load(open(p, encoding="utf-8")) for p in glob.glob(os.path.join(PAGES, "*.json"))]
    by_site = {}
    for m in metas:
        by_site[site_of(m["url"])] = by_site.get(site_of(m["url"]), 0) + 1
    fresh = sum(1 for m in metas if age_days(m) <= DEFAULT_MAX_AGE)
    print(f"{len(metas)} cached pages ({fresh} fetched within {DEFAULT_MAX_AGE} days), {len(by_site)} sites")
    for s, n in sorted(by_site.items(), key=lambda x: -x[1])[:25]:
        print(f"  {n:4}  {s}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    if cmd == "import":
        a, s = import_saved()
        print(f"Imported {a} saved pages into the cache ({s} skipped: duplicates or too short).")
    elif cmd == "purge-binary":
        n = 0
        for mp in glob.glob(os.path.join(PAGES, "*.json")):
            tp = mp[:-5] + ".txt"
            if os.path.exists(tp) and looks_binary(_body(tp)):
                os.remove(tp)
                os.remove(mp)
                n += 1
        print(f"Removed {n} unreadable cached pages (they'll be fetched again when needed).")
    elif cmd == "put":
        # python3 tools/pagecache.py put URL FILE  — store page text read another way (e.g. the browser pane)
        url, path = sys.argv[2], sys.argv[3]
        text = open(path, encoding="utf-8", errors="replace").read()
        meta = _write(url, url, "", text, "browser-pane", 200)
        print(f"Stored {len(text)} characters for {url} (method browser-pane)")
    elif cmd == "show":
        # python3 tools/pagecache.py show URL [START-END] [--grep REGEX]  (cached copy, with line numbers)
        url = sys.argv[2]
        text, meta, how = get(url)
        if not text:
            sys.exit(f"Not available: {how}")
        lines = text.split("\n")
        rng = next((a for a in sys.argv[3:] if re.match(r"^\d+-\d+$", a)), None)
        a_, b_ = (int(x) for x in rng.split("-")) if rng else (1, len(lines))
        rx = re.compile(sys.argv[sys.argv.index("--grep") + 1], re.I) if "--grep" in sys.argv else None
        print(f"{url} ({how}, fetched {meta['fetched'][:10]}, {len(lines)} lines)")
        for i in range(max(1, a_), min(len(lines), b_) + 1):
            if not rx or rx.search(lines[i - 1]):
                print(f"{i}: {lines[i - 1][:400]}")
    elif cmd == "get":
        age = float(sys.argv[sys.argv.index("--max-age") + 1]) if "--max-age" in sys.argv else DEFAULT_MAX_AGE
        text, meta, how = get(sys.argv[2], age)
        print(how, meta and meta.get("fetched"), len(text or ""))
    else:
        stats()
