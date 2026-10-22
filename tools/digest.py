#!/usr/bin/env python3
"""Fetch several official pages at once and print only the lines that matter (compact digest).

Usage:
  python3 tools/digest.py <uni-id> URL [URL …]            fetch pages (plain, then headless browser if needed)
  python3 tools/digest.py <uni-id> --local FILE [FILE …]   use pages already saved by tools/page_text.py --save
Options:
  --topic courses|uni|all   which keywords to look for (default all)
  --max N                   max lines per page (default 140)
Course pages get whole A-level blocks (6 lines after each match), skipping IB/BTEC/Scottish/etc. lines, so one call
usually gives everything needed — no follow-up slicing.

Pages come from the shared cache (tools/pagecache.py): a page fetched in the last 7 days is reused, never
re-downloaded, and tools/check_evidence.py checks quotes against the same copy.
"""
import argparse
import concurrent.futures as cf
import hashlib
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COURSE = (r"A\*|\bA{2,3}\b|\bA{1,2}B{1,2}\b|\bB{2,3}C?\b|\bBC{1,2}\b|\bCCC\b|UCAS (?:tariff )?points|tariff|\bpoints\b|"
          r"including|A[- ]?level|GCSE|Mathematics|Maths|Further Math|EPQ|Extended Project|contextual|TMUA|admissions test|"
          r"not accept|General Studies|Critical Thinking|year abroad|study abroad|placement|foundation year|"
          r"UCAS code|course code|Course code|duration|\byears?\b full[- ]time|full[- ]time|alternative offer|"
          r"widening participation|access programme|Psychology|Geography|essential|required|preferred|"
          r"applications per place|offer rate|offers made|BSc|BA \(Hons\)|MA \(Hons\)")
UNI = (r"£\s?\d|fee|tuition|per year|per week|a week|rent|accommodation|living cost|budget|open day|Open Day|"
       r"20(?:26|27|28)|contextual|POLAR|TUNDRA|IMD|ACORN|free school meals|care|carer|estranged|refugee|asylum|"
       r"first in (?:your|their) family|first generation|household income|postcode|eligib|criteria|summer school|"
       r"Year 12|deadline|apply by|applications (?:open|close)|residential|bursary|lower offer|reduced offer|"
       r"campus|postcode|[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}")
TOPICS = {"courses": COURSE, "uni": UNI, "all": COURSE + "|" + UNI}
UA_NOTE = "page_text.py"


def slug(url):
    s = re.sub(r"^https?://(www\.)?", "", url).strip("/")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s)[-60:].strip("-")
    return s or hashlib.sha1(url.encode()).hexdigest()[:10]


def fetch(url, max_age):
    """Page text from the shared cache (fetched only if missing or older than max_age days)."""
    import pagecache
    text, meta, how = pagecache.get(url, max_age)
    if text is None:
        return url, None, f"FAILED ({how}) — try the UCAS page, or record it as notConfirmed"
    return url, pagecache._paths(url)[0], how


NAV = re.compile(r"Navigation link|Press escape|Skip to (main )?content|cookie", re.I)


def boilerplate(paths):
    """Lines that appear on many of this uni's pages (menus, footers) are skipped."""
    from collections import Counter
    count = Counter()
    for p in paths:
        try:
            count.update(set(open(p, encoding="utf-8", errors="replace").read().split("\n")))
        except OSError:
            pass
    limit = max(3, int(len(paths) * 0.4) + 1)
    return {l for l, n in count.items() if n >= limit and len(l) > 2}


OTHER_QUALS = re.compile(r"International Baccalaureate|\bIB\b|BTEC|Access to (?:HE|Higher Education)|Scottish|Advanced Higher|"
                         r"\bHighers?\b|Irish Leaving|Leaving Certificate|T Level|European Baccalaureate|French Baccalaur|"
                         r"Pre-U|\bUS\b|American|Cambridge Technical|Welsh Baccalaureate|Advanced Skills Baccalaureate", re.I)


def digest(path, rx, maxlines, skip=frozenset(), window=1):
    lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
    head = [l for l in lines[:3] if l.startswith(("URL:", "TITLE:"))]
    keep = set()
    for i, l in enumerate(lines):
        if i < 3 or len(l) > 600 or l in skip or NAV.search(l):
            continue
        if window > 1 and OTHER_QUALS.search(l) and not re.search(r"A[- ]?level", l, re.I):
            continue
        if rx.search(l):
            keep.update(j for j in range(max(0, i - 1), min(len(lines), i + window + 1))
                        if not (window > 1 and OTHER_QUALS.search(lines[j]) and not re.search(r"A[- ]?level", lines[j], re.I)))
    out, last, n = [], -2, 0
    for i in sorted(keep):
        if n >= maxlines:
            out.append(f"… (more matches; read {path} with sed -n if needed)")
            break
        if i != last + 1:
            out.append("…")
        out.append(f"{i + 1}: {lines[i][:300]}")
        last = i
        n += 1
    return head, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("uni")
    ap.add_argument("items", nargs="+")
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--topic", default="all", choices=list(TOPICS))
    ap.add_argument("--max", type=int, default=140)
    ap.add_argument("--max-age", type=float, default=7, help="reuse cached pages fetched within this many days")
    a = ap.parse_args()
    rx = re.compile(TOPICS[a.topic], re.I if a.topic == "uni" else 0)
    if a.local:
        results = [(None, p, "local") for p in a.items]
    else:
        with cf.ThreadPoolExecutor(max_workers=6) as ex:
            results = list(ex.map(lambda u: fetch(u, a.max_age), dict.fromkeys(a.items)))
    skip = boilerplate([p for _, p, _ in results if p])
    for url, path, how in results:
        print("=" * 80)
        if not path:
            print(f"URL: {url}\n{how}")
            continue
        head, out = digest(path, rx, a.max, skip, window=6 if a.topic == "courses" else 2)
        print("\n".join(head) or f"FILE: {path}")
        print(f"(saved: {os.path.relpath(path, ROOT)} · {how})")
        print("\n".join(out) if out else "(no matching lines)")


if __name__ == "__main__":
    main()
