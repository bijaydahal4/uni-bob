#!/usr/bin/env python3
"""Build research/shared.json: facts from one official source that apply across many unis.

Researchers get these in their work packets instead of rediscovering them at every uni.
Currently: the UAT-UK course list (which courses use the TMUA, compulsory or recommended, 2027 entry).

Usage: python3 tools/shared_facts.py
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pagecache  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMUA_LIST = "https://uat-wp.s3.eu-west-2.amazonaws.com/wp-content/uploads/2026/04/01172717/Course_List_2027_Entry_Final.pdf"
TMUA_HOME = "https://esat-tmua.ac.uk/about-the-tests/tmua-test/"
UNI_HEADERS = {  # header text in the UAT-UK list → app uni id (Cambridge and Oxford are not in the app)
    "Durham University": "durham", "Imperial College London": "imperial",
    "The London School of Economics and Political Science": "lse", "The University of Warwick": "warwick", "UCL": "ucl",
    "The University of Cambridge": None, "The University of Oxford": None,
}
ROW = re.compile(r"^(?:(?P<name>.*?)\s+)?(?P<code>[A-Z0-9]{4})\s+(?P<test>TMUA|ESAT|TARA)\b(?P<rest>.*)$")


def tmua_facts():
    text, meta, how = pagecache.get(TMUA_LIST, max_age_days=30)
    if not text:
        raise SystemExit(f"Couldn't read the UAT-UK course list: {how}")
    raw = re.sub(r"\b([A-Z0-9]{4})[ \t]*\n\s*(TMUA|ESAT|TARA)\b", r"\1 \2", text)  # code and test split over lines
    raw = re.sub(r"(N/A|compulsory)[ \t\u00a0]+(?=\S)", r"\1\n", raw)  # two table rows sometimes share a line
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    unis, uni, rule, pending = {}, None, None, []
    skip = re.compile(r"^(Course Name UCAS|Last Updated|\d+$|▪|chosen from|Mathematics 1 \+)")
    for l in lines:
        head = next((h for h in UNI_HEADERS if l.startswith(h + " (")), None)
        if head:
            uni, rule, pending = UNI_HEADERS[head], None, []
            if uni:
                unis[uni] = {"header": l, "notes": [], "courses": []}
            continue
        if uni is None:
            continue
        if l.startswith("For each of the courses listed below"):
            rule = "compulsory" if "compulsory" in l else "recommended" if "recommended" in l else None
            unis[uni]["notes"].append(l)
            pending = []
            continue
        if l.startswith("*For ") or (unis[uni]["notes"] and unis[uni]["notes"][-1].startswith("*For ") and l.endswith("*") and not ROW.match(l)):
            unis[uni]["notes"].append(l)
            continue
        m = ROW.match(l)
        if not m:
            if not skip.match(l):
                pending.append(l)
            continue
        raw_name = " ".join([*pending, m.group("name") or ""])
        name = raw_name.replace("*", "").strip()
        pending = []
        row_rule = rule
        if row_rule is None and any(n.startswith("*For ") for n in unis[uni]["notes"]):
            row_rule = "compulsory" if "*" in raw_name else "recommended"  # LSE marks its compulsory courses with *
        if m.group("test") == "TMUA":
            unis[uni]["courses"].append({"name": name, "ucasCode": m.group("code"), "rule": row_rule, "line": l})
    return {
        "source": {"url": TMUA_LIST, "checked": meta["fetched"][:10], "title": "UAT-UK: Check if your courses require an admissions test (2027 entry)"},
        "about": {"url": TMUA_HOME, "text": "Only these universities use the TMUA (UAT-UK lists seven, including Cambridge and Oxford). "
                  "At every other uni in the app, only record a test if the course page itself names one."},
        "unis": unis,
    }


def main():
    out = {"built": dt.date.today().isoformat(), "tmua2027": tmua_facts()}
    path = os.path.join(ROOT, "research", "shared.json")
    json.dump(out, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    t = out["tmua2027"]["unis"]
    print(f"Wrote research/shared.json: TMUA list covers {', '.join(t)} "
          f"({sum(len(u['courses']) for u in t.values())} TMUA course rows).")
    for uid, u in t.items():
        econ = [c for c in u["courses"] if re.search(r"econ|financ|PPE|politic|account|manag", c["name"], re.I) or c["ucasCode"].startswith(("L", "N"))]
        print(f"  {uid}: " + "; ".join(f"{c['name'] or '?'} {c['ucasCode']} ({c['rule']})" for c in econ))


if __name__ == "__main__":
    main()
