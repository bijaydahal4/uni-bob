#!/usr/bin/env python3
"""Audit research efficiency: pages fetched vs sources cited, duplicate fetches, quotes per uni.

Usage: python3 tools/research_audit.py [--json OUT]
Reads research/unis/*.json, every saved page under research/tmp/ and research/cache/, and
research/agent-runs.json (tool calls / tokens / time reported for each research agent).
"""
import collections
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pagecache  # noqa: E402
from pagecache import norm_url, site_of  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def page_url(path):
    """URL recorded at the top of a saved page (page_text --save, page_text stdout or cache file)."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            head = f.read(600)
    except OSError:
        return None
    m = re.search(r"^URL: (\S+)", head, re.M)
    return m.group(1) if m else None


def cited(obj, out):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("url", "postcodeSource", "coordsSource") and isinstance(v, str) and v.startswith("http"):
                out.add(norm_url(v))
            elif k == "links" and isinstance(v, dict):
                out.update(norm_url(x) for x in v.values() if isinstance(x, str) and x.startswith("http"))
            else:
                cited(v, out)
    elif isinstance(obj, list):
        for v in obj:
            cited(v, out)


def quotes(obj):
    n = 0
    if isinstance(obj, dict):
        if isinstance(obj.get("evidence"), str) and obj["evidence"].strip():
            n += 1
        n += sum(quotes(v) for v in obj.values())
    elif isinstance(obj, list):
        n += sum(quotes(v) for v in obj)
    return n


def main():
    unis = {}
    for p in sorted(glob.glob(os.path.join(ROOT, "research", "unis", "*.json"))):
        d = json.load(open(p, encoding="utf-8"))
        urls = set()
        cited(d, urls)
        sites = collections.Counter(site_of(u) for u in urls)
        home = site_of((d.get("links") or {}).get("home") or "") or (sites.most_common(1)[0][0] if sites else "")
        unis[d["id"]] = {"courses": len(d.get("courses") or []), "quotes": quotes(d), "cited": urls, "site": home}
    site_to_uni = {v["site"]: k for k, v in unis.items() if v["site"]}

    fetched = collections.defaultdict(list)   # uni -> [(url, path)]
    other = collections.Counter()
    files = [p for p in glob.glob(os.path.join(ROOT, "research", "tmp", "**", "*"), recursive=True)
             if os.path.isfile(p) and not p.endswith((".py", ".png", ".json", ".md"))]
    files += glob.glob(os.path.join(ROOT, "research", "cache", "pages", "*.txt"))
    for p in files:
        u = page_url(p)
        if not u:
            continue
        uni = site_to_uni.get(site_of(u))
        if uni:
            fetched[uni].append((norm_url(u), p))
        else:
            other[site_of(u)] += 1

    runs = []
    rp = os.path.join(ROOT, "research", "agent-runs.json")
    if os.path.exists(rp):
        runs = json.load(open(rp, encoding="utf-8")).get("runs", [])

    rows = []
    for uid, u in sorted(unis.items()):
        saves = fetched.get(uid, [])
        distinct = {x for x, _ in saves}
        rows.append({
            "uni": uid, "courses": u["courses"], "quotes": u["quotes"], "citedUrls": len(u["cited"]),
            "savedFiles": len(saves), "distinctFetched": len(distinct), "duplicateSaves": len(saves) - len(distinct),
            "fetchedNotCited": len(distinct - u["cited"]),
        })
    print(f"{'uni':14}{'courses':>8}{'quotes':>8}{'cited URLs':>12}{'page files':>12}{'distinct':>10}{'dupes':>7}{'unused':>8}")
    for r in rows:
        print(f"{r['uni']:14}{r['courses']:>8}{r['quotes']:>8}{r['citedUrls']:>12}{r['savedFiles']:>12}{r['distinctFetched']:>10}"
              f"{r['duplicateSaves']:>7}{r['fetchedNotCited']:>8}")
    done = [r for r in rows if r["courses"]]
    if done:
        avg = lambda k: sum(r[k] for r in done) / len(done)  # noqa: E731
        print(f"{'average':14}{avg('courses'):>8.1f}{avg('quotes'):>8.1f}{avg('citedUrls'):>12.1f}{avg('savedFiles'):>12.1f}"
              f"{avg('distinctFetched'):>10.1f}{avg('duplicateSaves'):>7.1f}{avg('fetchedNotCited'):>8.1f}")
    print(f"\nPages on shared/other sites: {sum(other.values())} ({', '.join(f'{s} {n}' for s, n in other.most_common(6))})")
    if runs:
        print(f"\n{'agent run':34}{'model':>8}{'tool calls':>12}{'tokens':>10}{'minutes':>9}  result")
        for r in runs:
            print(f"{r['name'][:34]:34}{r.get('model', ''):>8}{(r.get('toolCalls') or '—'):>12}{(r.get('tokens') or '—'):>10}"
                  f"{(r['ms'] / 60000 if r.get('ms') else 0):>9.1f}  {r.get('result', '')}")
    if "--since" in sys.argv:  # downloads made through the shared cache after a given local time
        since = sys.argv[sys.argv.index("--since") + 1]
        dl = collections.Counter()
        for mp in glob.glob(os.path.join(pagecache.PAGES, "*.json")):
            m = json.load(open(mp, encoding="utf-8"))
            if m.get("method") in ("plain", "browser") and m.get("fetched", "") >= since and pagecache.norm_url(m["url"]) == m.get("norm"):
                dl[pagecache.site_of(m["url"])] += 1
        print(f"\nPages downloaded since {since}: {sum(dl.values())}  " + ", ".join(f"{k} {v}" for k, v in dl.most_common()))
    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        json.dump({"unis": rows, "otherSites": other, "runs": runs}, open(out, "w"), indent=1, default=list)


if __name__ == "__main__":
    main()
