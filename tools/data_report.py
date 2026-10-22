#!/usr/bin/env python3
"""Write DATA_REPORT.md from the data files and verification results.

Usage: python3 tools/data_report.py
"""
import collections
import datetime as dt
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return json.load(f)


def main():
    unis = load("data", "universities.json")["unis"]
    progs = load("data", "programmes.json")["programmes"]
    steps = load("data", "timeline.json")["steps"]
    meta = load("data", "meta.json")
    courses = [(u, c) for u in unis for c in u["courses"]]
    years = collections.Counter(c.get("entryYear") for _, c in courses)
    L = [f"# Uni Bob data report", "", f"Generated {dt.date.today().isoformat()} from `/data`. Last checked: {meta.get('lastChecked')}.", ""]
    L += ["## Totals", "",
          f"- **{len(unis)} universities**, **{len(courses)} courses**, **{len(progs)} summer schools and access programmes**, "
          f"**{len(steps)} timeline steps**, **{meta.get('sourceCount')} official source pages**.",
          f"- Entry year: " + ", ".join(f"{n} courses for {y} entry" for y, n in sorted(years.items(), key=lambda x: str(x[0]))) + ".",
          f"- League table: {meta['leagueTable']['name']} (published {meta['leagueTable']['published']}), overall and Economics tables.",
          f"- Distances are straight-line miles from {meta['home']['name']}.", ""]
    L += ["## Universities", "", "| Uni | Russell Group | CUG 2027 rank | Courses | Region |", "|---|---|---|---|---|"]
    for u in sorted(unis, key=lambda u: (u["rank"].get("overall") or 999, u["name"])):
        L.append(f"| {u['name']} | {'Yes' if u['russellGroup'] else ''} | {u['rank'].get('overall') or '—'} | {len(u['courses'])} | {u.get('region')} |")
    L += [""]

    def notable(title, items):
        L.extend([f"### {title} ({len(items)})", ""])
        L.extend(f"- {x}" for x in sorted(items)) if items else L.append("- None")
        L.append("")

    L += ["## Notable", ""]
    notable("Courses that need an admissions test", [f"{c['name']}, {u['shortName']} ({c['admissionsTest'].get('name') or 'test'})" for u, c in courses if (c.get("admissionsTest") or {}).get("status") == "required"])
    notable("Courses where an admissions test is optional", [f"{c['name']}, {u['shortName']} ({c['admissionsTest'].get('name') or 'test'}): {(c['admissionsTest'].get('effect') or '')[:120]}" for u, c in courses if (c.get("admissionsTest") or {}).get("status") == "optional"])
    notable("Courses needing an A* in Maths", [f"{c['name']}, {u['shortName']}" for u, c in courses if any(g.get("minGrade") == "A*" and any("Math" in s for s in g["subjects"]) for g in c.get("subjectRequirements") or [])])
    notable("Courses needing Further Maths", [f"{c['name']}, {u['shortName']}" for u, c in courses if c.get("furtherMaths") == "required" or any(g["subjects"] == ["Further Mathematics"] for g in c.get("subjectRequirements") or [])])
    notable("Courses where Further Maths is preferred", [f"{c['name']}, {u['shortName']}" for u, c in courses if c.get("furtherMaths") == "preferred"])
    notable("Courses with officially published competition figures", [f"{c['name']}, {u['shortName']}: {(c['competition'].get('text') or '')[:100]}" for u, c in courses if c.get("competition")])
    notable("Courses that don't accept Psychology or Geography", [f"{c['name']}, {u['shortName']}" for u, c in courses if "no" in (c.get("acceptsPsychology"), c.get("acceptsGeography"))])

    L += ["## Not confirmed", "", "Everything below is shown in the app as \"Not confirmed: check the uni's page\" (or left out).", ""]
    for u in sorted(unis, key=lambda u: u["name"]):
        items = list(u.get("notConfirmed") or [])
        for c in u["courses"]:
            items += [f"{c['name']}: {x}" for x in c.get("notConfirmed") or []]
        if items:
            L.append(f"**{u['name']}**")
            L.extend(f"- {x}" for x in items)
            L.append("")
    pitems = [f"{p['name']}: {x}" for p in progs for x in p.get("notConfirmed") or []]
    if pitems:
        L += ["**Summer schools and programmes**"] + [f"- {x}" for x in pitems] + [""]
    expected = [s for s in steps if s.get("status") == "Expected"]
    L += [f"**Timeline:** {len(expected)} of {len([s for s in steps if not s.get('now')])} dates are Expected (based on previous years); "
          "2028-entry dates hadn't been published by UCAS, UAT-UK, JCQ or Student Finance England when checked.", ""]

    auto_p = os.path.join(ROOT, "research", "verify", "auto.json")
    weak_p = os.path.join(ROOT, "research", "verify", "weak-review.json")
    if os.path.exists(auto_p):
        ids = {c["id"] for _, c in courses}
        auto = {k: v for k, v in load("research", "verify", "auto.json")["courses"].items() if k in ids}
        st = collections.Counter(v["status"] for v in auto.values())
        review = load("research", "verify", "weak-review.json")["courses"] if os.path.exists(weak_p) else []
        rv = collections.Counter(r["result"] for r in review)
        L += ["## Verification pass", "",
              f"A separate pass re-opened the official source of every course ({len(auto)} of {len(courses)}; "
              "`tools/auto_verify.py --fresh`) and checked that each quote is on today's page and that the typical offer, "
              "required subject grades, admissions test and entry year match it: "
              f"**{st['verified']} verified**, {st['verified (weak)'] + st['weak']} verified with weaker matches, {st['review']} needed review."]
        older = collections.defaultdict(set)
        for k, v in auto.items():
            if (v.get("fetched") or "")[:10] < (v.get("checked") or ""):
                older[next(u["name"] for u, c in courses if c["id"] == k)].add((v.get("fetched") or "")[:10])
        for name, days in sorted(older.items()):
            L.append(f"{name}'s website was unavailable during this check (down or under maintenance), so its "
                     f"courses were checked against the copies fetched on {', '.join(sorted(days))}.")
        if review:
            L.append(f"Fresh subagents then re-read {len(review)} weaker matches by hand: "
                     + ", ".join(f"{n} {k}" for k, n in sorted(rv.items())) + ".")
        L.append("")
        L.extend(f"- {r['id']}: {r['result']}. {r.get('note', '')[:200]}" for r in review if r["result"] != "confirmed")
        L.extend(f"- {k}: {'; '.join(v.get('problems') or v.get('weak') or [])[:200]}"
                 for k, v in sorted(auto.items()) if v["status"] == "review")
        missing = sorted(ids - set(auto))
        if missing:
            L.append(f"- Not checked by the automated pass: {', '.join(missing)}")
        L.append("")
    L += ["## Scope decisions", "",
          "- All Russell Group universities except Oxford and Cambridge, plus Bath, Loughborough and St Andrews.",
          "- Every university in England and Wales ranked roughly in the top 75 (77th or higher) of the Complete University Guide 2027 that offers a relevant course, plus SOAS (named in the brief; 94th).",
          "- Left out: specialist arts and agricultural institutions without general Economics or Business courses (University of the Arts London, Harper Adams, Norwich University of the Arts, Falmouth, Arts University Bournemouth), and Scottish and Northern Irish universities other than Edinburgh, Glasgow, Queen's Belfast and St Andrews.",
          "- Regions: London, South East, South West, East of England, Midlands, North, Wales, Scotland, Northern Ireland.", ""]
    open(os.path.join(ROOT, "DATA_REPORT.md"), "w", encoding="utf-8").write("\n".join(L))
    print("Wrote DATA_REPORT.md")


if __name__ == "__main__":
    main()
