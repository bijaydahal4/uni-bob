#!/usr/bin/env python3
"""List what changed in data/universities.json compared with the last commit (or another file).

Usage:
  python3 tools/diff_data.py                 compare with the version in the last git commit
  python3 tools/diff_data.py OLD.json        compare with a saved copy
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POINTS = {"A*": 6, "A": 5, "B": 4, "C": 3, "D": 2, "E": 1}


def pts(s):
    if not s:
        return None
    out, i = 0, 0
    while i < len(s):
        if s[i] == "A" and s[i + 1:i + 2] == "*":
            out += 6
            i += 2
        else:
            out += POINTS.get(s[i], 0)
            i += 1
    return out


def courses(data):
    out = {}
    for u in data.get("unis", []):
        for c in u.get("courses", []):
            out[c["id"]] = (u["shortName"], c)
    return out


def offer(c):
    o = c.get("offer") or {}
    return o.get("typical") or (f"{o['tariff']} points" if o.get("tariff") else None)


def main():
    new = json.load(open(os.path.join(ROOT, "data", "universities.json"), encoding="utf-8"))
    if len(sys.argv) > 1:
        old = json.load(open(sys.argv[1], encoding="utf-8"))
    else:
        try:
            old = json.loads(subprocess.run(["git", "show", "HEAD:data/universities.json"], cwd=ROOT, capture_output=True,
                                            text=True, check=True).stdout)
        except Exception:
            print("No committed version to compare with.")
            return
    a, b = courses(old), courses(new)
    added = [b[k] for k in b if k not in a]
    removed = [a[k] for k in a if k not in b]
    up, down, other, years = [], [], [], []
    for k in a.keys() & b.keys():
        (uni, oc), (_, nc) = a[k], b[k]
        if oc.get("entryYear") != nc.get("entryYear"):
            years.append(f"{nc['name']} at {uni}: now {nc.get('entryYear')} entry")
        o1, o2 = offer(oc), offer(nc)
        if o1 != o2:
            p1, p2 = pts((oc.get("offer") or {}).get("typical")), pts((nc.get("offer") or {}).get("typical"))
            line = f"{nc['name']} at {uni}: {o1 or 'not confirmed'} → {o2 or 'not confirmed'}"
            (up if p1 is not None and p2 is not None and p2 > p1 else down if p1 is not None and p2 is not None and p2 < p1 else other).append(line)
    for title, items in (("Offers went UP", up), ("Offers went DOWN", down), ("Offers changed in another way", other),
                         ("Now using a newer entry year", years),
                         ("New courses", [f"{c['name']} at {u}" for u, c in added]),
                         ("Removed courses", [f"{c['name']} at {u}" for u, c in removed])):
        print(f"\n{title}: {len(items)}")
        for line in sorted(items):
            print(f"  - {line}")


if __name__ == "__main__":
    main()
