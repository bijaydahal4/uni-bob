#!/usr/bin/env python3
"""Fill or correct one fact in a research file in a single command (for gap-filling and fixes).

Usage:
  python3 tools/set_fact.py <uni> <path> <json-value> [--url URL --evidence "verbatim quote"] [--not-confirmed "reason"]

<path> is dotted, and list items can be picked by id: e.g.
  programmes[id=sheffield-subject-tasters].infoYear
  courses[id=bath-economics].offer.typical
  fees.homeAnnual
With --url/--evidence the nearest `source` object is updated too (checked = today). With --not-confirmed the value
is left unset and the reason is added to the nearest `notConfirmed` list. The quote is checked against the cached
page straight away.
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def walk(obj, path):
    """Return (parents, last_key): parents is the chain of containers from the root."""
    parts = re.findall(r"[^.\[\]]+(?:\[[^\]]+\])?", path)
    chain = [obj]
    for i, part in enumerate(parts):
        m = re.match(r"^([^\[]+)(?:\[(.+)\])?$", part)
        key, sel = m.group(1), m.group(2)
        last = i == len(parts) - 1 and not sel
        if last:
            return chain, key
        cur = chain[-1].setdefault(key, [] if sel else {})
        if sel:
            if "=" in sel:
                k, v = sel.split("=", 1)
                found = next((x for x in cur if str(x.get(k)) == v), None)
                if found is None:
                    sys.exit(f"No item with {k}={v} in {key}")
                cur = found
            else:
                cur = cur[int(sel)]
        chain.append(cur)
    sys.exit("Path must end with a field name")


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    uni, path, raw = sys.argv[1], sys.argv[2], sys.argv[3]
    opt = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None  # noqa: E731
    fp = os.path.join(ROOT, "research", "unis", f"{uni}.json")
    data = json.load(open(fp, encoding="utf-8"))
    chain, key = walk(data, path)
    target = chain[-1]
    today = dt.date.today().isoformat()
    if opt("--not-confirmed"):
        holder = next((c for c in reversed(chain) if isinstance(c, dict) and "notConfirmed" in c), chain[-1])
        holder.setdefault("notConfirmed", []).append(f"{key}: {opt('--not-confirmed')}")
        target[key] = None
    else:
        try:
            target[key] = json.loads(raw)
        except ValueError:
            target[key] = raw
    if opt("--url") or opt("--evidence"):
        holder = next((c for c in reversed(chain) if isinstance(c, dict) and isinstance(c.get("source"), dict)), target)
        src = holder.setdefault("source", {})
        if opt("--url"):
            src["url"] = opt("--url")
        if opt("--evidence"):
            src["evidence"] = opt("--evidence")
        src["checked"] = today
    json.dump(data, open(fp, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"Set {uni}: {path} = {json.dumps(target.get(key))[:120]}")
    if opt("--evidence"):
        from check_evidence import found, page_text
        url = opt("--url") or (holder.get("source") or {}).get("url")
        print("Quote found on the page." if found(opt("--evidence"), page_text(url)) else "WARNING: quote NOT found on the page — fix it.")


if __name__ == "__main__":
    main()
