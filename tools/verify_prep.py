#!/usr/bin/env python3
"""Prepare verification checklists: one small file per uni listing each course's claimed facts and source.

Usage: python3 tools/verify_prep.py [uni-id …]      (default: every uni in research/unis/)
Writes research/verify/<uni-id>-todo.md. Verifiers record results in research/verify/<uni-id>.json.
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "verify")


def describe(c):
    o = c.get("offer") or {}
    offer = o.get("typical") or (f"{o.get('tariff')} UCAS points" if o.get("tariff") else "NOT CONFIRMED")
    if o.get("low"):
        offer += f" (range down to {o['low']})"
    if o.get("tariffLow"):
        offer += f" (range down to {o['tariffLow']} points)"
    reqs = "; ".join(f"{' or '.join(g.get('subjects') or [])}{' at ' + g['minGrade'] if g.get('minGrade') else ''}"
                     for g in c.get("subjectRequirements") or []) or "none recorded"
    t = c.get("admissionsTest") or {}
    test = f"{t.get('status', 'none')}{' (' + t['name'] + ')' if t.get('name') else ''}"
    url = (o.get("source") or {}).get("url") or (c.get("links") or {}).get("course")
    return offer, reqs, test, url


def main():
    os.makedirs(OUT, exist_ok=True)
    wanted = set(sys.argv[1:])
    for path in sorted(glob.glob(os.path.join(ROOT, "research", "unis", "*.json"))):
        u = json.load(open(path, encoding="utf-8"))
        if wanted and u["id"] not in wanted or not u.get("courses"):
            continue
        lines = [f"# Verify {u['name']} ({u['id']})", "",
                 "For each course, re-open the source URL and confirm the entry year, typical offer (and range), required",
                 "subjects with grades, and admissions test. Record results in research/verify/" + u["id"] + ".json.", ""]
        urls = []
        for c in u["courses"]:
            offer, reqs, test, url = describe(c)
            urls.append(url)
            lines += [f"## {c['id']}", f"- Course: {c.get('name')} ({c.get('degree')}), entry year {c.get('entryYear')}",
                      f"- Claimed offer: {offer}", f"- Claimed required subjects: {reqs}", f"- Claimed admissions test: {test}",
                      f"- Source: {url}", ""]
        lines += ["Read all sources in one call:", "",
                  f"python3 tools/digest.py {u['id']} --topic courses " + " ".join(dict.fromkeys(x for x in urls if x)), ""]
        open(os.path.join(OUT, f"{u['id']}-todo.md"), "w", encoding="utf-8").write("\n".join(lines))
        print("wrote", f"research/verify/{u['id']}-todo.md")


if __name__ == "__main__":
    main()
