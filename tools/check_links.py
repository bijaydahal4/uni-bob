#!/usr/bin/env python3
"""Check every source URL in /data: report broken links and pages that changed since the last check.

Usage:
  python3 tools/check_links.py            report only
  python3 tools/check_links.py --update   also save the new page hashes (do this after a refresh)
Page hashes are stored in tools/state/source-hashes.json (committed), so a refresh can focus on what changed.
A report is written to research/link-report.md.
"""
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from html_text import text_from_html  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "tools", "state", "source-hashes.json")
REPORT = os.path.join(ROOT, "research", "link-report.md")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"


def urls_in(obj, where, out):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and v.startswith("http") and k in ("url", "course", "ucas", "home", "courses", "economics",
                                                                      "openDays", "fees", "contextual", "accommodation", "source",
                                                                      "postcodeSource"):
                out.setdefault(v.split("#")[0], set()).add(where)
            else:
                urls_in(v, where, out)
    elif isinstance(obj, list):
        for v in obj:
            urls_in(v, where, out)


def collect():
    out = {}
    unis = json.load(open(os.path.join(ROOT, "data", "universities.json"), encoding="utf-8"))["unis"]
    for u in unis:
        urls_in(u, u["id"], out)
    for p in json.load(open(os.path.join(ROOT, "data", "programmes.json"), encoding="utf-8"))["programmes"]:
        urls_in(p, f"programme {p['id']}", out)
    for s in json.load(open(os.path.join(ROOT, "data", "timeline.json"), encoding="utf-8"))["steps"]:
        urls_in(s, f"timeline {s['id']}", out)
    return out


def fingerprint(html):
    text = text_from_html(html)
    text = re.sub(r"\s+", " ", text.lower())
    # Ignore things that change on every visit (dates of 'today', cookie banners) as best we can.
    text = re.sub(r"\b\d{1,2}:\d{2}\b", "", text)
    return hashlib.sha256(text.encode()).hexdigest()[:20]


def check(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
            return {"status": r.status, "final": r.geturl(), "hash": fingerprint(html)}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "final": url, "hash": None}
    except Exception as e:  # network errors, timeouts
        return {"status": 0, "final": url, "hash": None, "error": str(e)[:120]}


def main():
    update = "--update" in sys.argv
    urls = collect()
    old = {}
    if os.path.exists(STATE):
        old = json.load(open(STATE, encoding="utf-8")).get("pages", {})
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        results = dict(zip(urls, ex.map(check, urls)))
    broken, blocked, changed, new = [], [], [], []
    for url, r in sorted(results.items()):
        if r["status"] in (401, 403, 429, 503):
            blocked.append(url)
        elif r["status"] == 0 or r["status"] >= 400:
            broken.append(url)
        elif url not in old:
            new.append(url)
        elif old[url].get("hash") and r["hash"] != old[url]["hash"]:
            changed.append(url)
    today = dt.date.today().isoformat()
    lines = [f"# Link report ({today})", "", f"{len(urls)} URLs checked.", ""]
    for title, items in (("Broken (fix these)", broken), ("Blocked to scripts (check by hand in a browser)", blocked),
                         ("Changed since last check (re-check the facts)", changed), ("New (no previous hash)", new)):
        lines.append(f"## {title}: {len(items)}")
        for u in items:
            lines.append(f"- {u}  ({', '.join(sorted(urls[u]))[:120]}) — {results[u]['status']}")
        lines.append("")
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    open(REPORT, "w", encoding="utf-8").write("\n".join(lines))
    print(f"{len(urls)} URLs: {len(broken)} broken, {len(blocked)} blocked to scripts, {len(changed)} changed, {len(new)} new.")
    print(f"Report: {os.path.relpath(REPORT, ROOT)}")
    if update:
        pages = {u: {"hash": r["hash"], "status": r["status"], "checked": today} for u, r in results.items()}
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        json.dump({"updated": today, "pages": pages}, open(STATE, "w", encoding="utf-8"), indent=1, sort_keys=True)
        print(f"Saved hashes to {os.path.relpath(STATE, ROOT)}")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
