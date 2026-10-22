#!/usr/bin/env python3
"""Check that every `evidence` quote in a research or data file really appears on its source page.

Usage:
  python3 tools/check_evidence.py research/unis/bath.json [more files…]
  python3 tools/check_evidence.py data/universities.json --quiet

Pages come from the shared cache (tools/pagecache.py): fetched once, reused for 7 days.
Use --fresh to re-open every source now (the verification pass does this).
Quotes may use "..." to skip text between pieces. Matching ignores case, spacing, quote styles and dashes.
Exit code 1 if any quote is missing.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "research", "tmp", "cache")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def norm(s):
    s = s.lower()
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"[‐-―−]", "-", s)
    s = s.replace(" ", " ").replace("&amp;", "&")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


MAX_AGE = 7  # days; --fresh re-opens every source (used by the verification pass)


_rendered = set()  # pages already re-opened in the browser this run


def page_text(url, browser=False):
    import pagecache
    if browser:
        _rendered.add(url)
        text, meta, how = pagecache.get(url, 0, browser="always")
    else:
        text, meta, how = pagecache.get(url, MAX_AGE)
    return text or ""


def quote_found(ev, url):
    """Checks the cached copy first; if the quote is missing there, re-opens the page once in the browser
    (some sites load entry requirements or fees with JavaScript, so a plain copy can miss them)."""
    if found(ev, page_text(url)):
        return True
    return url not in _rendered and found(ev, page_text(url, browser=True))


def found(evidence, text):
    t = norm(text)
    pos = 0
    for piece in re.split(r"\.\.\.|…", evidence):
        p = norm(piece).strip(" .,;:'\"")
        if len(p) < 4:
            continue
        i = t.find(p, pos)
        if i < 0:
            return False
        pos = i + len(p)
    return True


def walk(obj, path="$"):
    if isinstance(obj, dict):
        src = obj.get("source") if isinstance(obj.get("source"), dict) else None
        if src and src.get("url") and src.get("evidence"):
            yield path, src["url"], src["evidence"]
        if obj.get("url") and obj.get("evidence") and isinstance(obj.get("evidence"), str):
            yield path, obj["url"], obj["evidence"]
        for k, v in obj.items():
            if k != "source":
                yield from walk(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}[{i}]")


def main():
    global MAX_AGE
    files = [a for a in sys.argv[1:] if not a.startswith("--")]
    quiet = "--quiet" in sys.argv
    if "--fresh" in sys.argv:
        MAX_AGE = 0
    missing = total = 0
    for f in files:
        data = json.load(open(f, encoding="utf-8"))
        for path, url, ev in walk(data):
            total += 1
            if not quote_found(ev, url):
                missing += 1
                print(f"MISSING  {f} {path}\n         url: {url}\n         evidence: {ev[:160]}")
    if not quiet or missing:
        print(f"\n{total - missing}/{total} evidence quotes found on their pages")
    sys.exit(1 if missing else 0)


if __name__ == "__main__":
    main()
