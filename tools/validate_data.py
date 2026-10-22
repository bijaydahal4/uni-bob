#!/usr/bin/env python3
"""Validate Uni Bob's data files.

Usage: python3 tools/validate_data.py
Checks that every fact has a source URL and checked date, every course has an entry year, there are no empty
required fields, and grades, dates and statuses are valid. Exit code 1 if there are errors.
"""
import datetime as dt
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAY = dt.date.today()
GRADES = {"A*", "A", "B", "C", "D", "E"}
GRADE_STR = re.compile(r"^(A\*|[ABCDE]){2,4}$")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REGIONS = {"London", "South East", "South West", "East of England", "Midlands", "North", "Wales", "Scotland", "Northern Ireland"}
TYPES = {"economics", "economics-finance", "economics-accounting", "business-economics", "economics-management", "economics-politics",
         "ppe", "economics-geography", "behavioural-economics", "maths-economics", "finance", "accounting-finance",
         "business-management", "real-estate"}
ALT = {"epq", "contextual", "accessProgramme", "summerSchool", "tmua", "other"}
CTX_KEYS = {"area", "fsm", "school", "firstGen", "care", "carer", "estranged", "refugee", "income", "access", "other"}

errors, warnings = [], []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def warn(where, msg):
    warnings.append(f"{where}: {msg}")


def load(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return json.load(f)


def is_url(u):
    return isinstance(u, str) and re.match(r"^https?://[^\s]+\.[^\s]+", u) is not None


def check_date(where, d, label="date", future_ok=True):
    if d is None:
        return
    if not isinstance(d, str) or not ISO.match(d):
        err(where, f"{label} '{d}' is not YYYY-MM-DD")
        return
    try:
        day = dt.date.fromisoformat(d)
    except ValueError:
        err(where, f"{label} '{d}' is not a real date")
        return
    if not future_ok and day > TODAY:
        err(where, f"{label} {d} is in the future")


def listed(u, *words):
    """True if the record's notConfirmed list mentions any of these words (unknown → null + a notConfirmed line)."""
    return any(any(w in str(x).lower() for w in words) for x in u.get("notConfirmed") or [])


def check_source(where, src, required=True, need_evidence=False):
    if not src:
        if required:
            err(where, "missing source")
        return
    if not is_url(src.get("url")):
        err(where, f"source url missing or invalid ({src.get('url')!r})")
    if not src.get("checked"):
        err(where, "source has no checked date")
    else:
        check_date(where, src.get("checked"), "checked", future_ok=False)
    if need_evidence and not src.get("evidence"):
        warn(where, "source has no evidence quote")


def check_course(c, u, seen):
    w = f"course {c.get('id')}"
    if not c.get("id"):
        err(f"uni {u['id']}", "course without id")
        return
    if c["id"] in seen:
        err(w, "duplicate course id")
    seen.add(c["id"])
    for k in ("name", "degree"):
        if not c.get(k):
            err(w, f"missing {k}")
    if c.get("entryYear") not in (2027, 2028):
        flagged = c.get("entryYear") == 2026 and any("2027" in str(x) for x in c.get("notConfirmed") or [])
        (warn if flagged else err)(w, f"entryYear {c.get('entryYear')!r}" + (" (2027 not confirmed by the uni; flagged)" if flagged else " must be 2027 or 2028"))
    if not c.get("types") or not set(c["types"]) <= TYPES:
        err(w, f"invalid types {c.get('types')}")
    if not c.get("ucasCode"):
        warn(w, "no UCAS code")
    if not isinstance(c.get("lengthYears"), (int, float)):
        warn(w, "no length in years")
    o = c.get("offer") or {}
    has_offer = bool(o.get("typical")) or isinstance(o.get("tariff"), (int, float))
    if o.get("typical") and not GRADE_STR.match(o["typical"]):
        err(w, f"typical offer '{o['typical']}' isn't a grade string")
    if o.get("low") and not GRADE_STR.match(o["low"]):
        err(w, f"low offer '{o['low']}' isn't a grade string")
    if o.get("kind") == "tariff" and not isinstance(o.get("tariff"), (int, float)):
        err(w, "tariff offer without points")
    if has_offer:
        check_source(w + " offer", o.get("source"), need_evidence=True)
    elif not any("offer" in str(x).lower() for x in c.get("notConfirmed") or []):
        err(w, "no offer and not listed in notConfirmed")
    for g in c.get("subjectRequirements") or []:
        if not g.get("subjects"):
            err(w, "subject requirement with no subjects")
        if g.get("minGrade") and g["minGrade"] not in GRADES:
            err(w, f"invalid minGrade {g['minGrade']}")
    for a in c.get("alternativeOffers") or []:
        if a.get("type") not in ALT:
            err(w, f"invalid alternative offer type {a.get('type')}")
        if a.get("offer") and not GRADE_STR.match(a["offer"]):
            err(w, f"alternative offer '{a['offer']}' isn't a grade string")
        check_source(w + f" alternative ({a.get('type')})", a.get("source"))
    t = c.get("admissionsTest") or {}
    if t.get("status") not in ("required", "optional", "none"):
        err(w, f"admissions test status {t.get('status')!r}")
    elif t.get("status") != "none":
        check_source(w + " admissions test", t.get("source"), need_evidence=True)
    if c.get("competition"):
        check_source(w + " competition", c["competition"].get("source"), need_evidence=True)
    if not is_url((c.get("links") or {}).get("course")) and not is_url(o.get("source", {}).get("url") if o.get("source") else None):
        err(w, "no official course link")


def main():
    unis = load("universities.json")["unis"]
    progs = load("programmes.json")["programmes"]
    steps = load("timeline.json")["steps"]
    gloss = load("glossary.json")["terms"]
    meta = load("meta.json")
    seen_uni, seen_course = set(), set()
    for u in unis:
        w = f"uni {u.get('id')}"
        if u.get("id") in seen_uni:
            err(w, "duplicate uni id")
        seen_uni.add(u.get("id"))
        for k in ("name", "shortName", "city", "country", "setting"):
            if not u.get(k):
                err(w, f"missing {k}")
        if u.get("region") not in REGIONS:
            err(w, f"region {u.get('region')!r} not allowed")
        loc = u.get("location") or {}
        if not isinstance(loc.get("lat"), (int, float)) or not isinstance(loc.get("lng"), (int, float)):
            if listed(u, "location", "postcode", "coordinates"):
                warn(w, "no coordinates (listed in notConfirmed)")
            else:
                err(w, "missing coordinates")
        else:
            if not (49 < loc["lat"] < 61 and -9 < loc["lng"] < 2):
                err(w, f"coordinates {loc['lat']},{loc['lng']} are outside the UK")
            if not is_url(loc.get("source")):
                err(w, "coordinates have no source")
        if not (u.get("rank") or {}).get("overall"):
            warn(w, "no league table rank")
        for key in ("fees", "livingCosts", "openDays", "contextual"):
            block = u.get(key)
            if not block:
                warn(w, f"no {key}")
                continue
            empty = all(v in (None, [], {}) for k, v in block.items() if k not in ("text", "source", "url"))
            if empty and not block.get("source") and listed(u, key.lower()):
                warn(w, f"{key} not confirmed (listed in notConfirmed)")
                continue
            check_source(f"{w} {key}", block.get("source"), required=key != "openDays" or bool(block.get("events")))
        f = u.get("fees") or {}
        if f.get("homeAnnual") is not None and not f.get("academicYear"):
            err(w, "fee without academic year")
        for e in (u.get("openDays") or {}).get("events") or []:
            check_date(w + " open day", e.get("date"))
            if e.get("status") not in ("Confirmed", "Expected"):
                err(w, f"open day status {e.get('status')!r}")
        for c in (u.get("contextual") or {}).get("criteria") or []:
            if c.get("key") not in CTX_KEYS:
                err(w, f"contextual criterion key {c.get('key')!r}")
        if not u.get("courses"):
            err(w, "no courses")
        for c in u.get("courses") or []:
            check_course(c, u, seen_course)
    seen_p = set()
    for p in progs:
        w = f"programme {p.get('id')}"
        if p.get("id") in seen_p:
            err(w, "duplicate id")
        seen_p.add(p.get("id"))
        for k in ("name", "provider", "url"):
            if not p.get(k):
                err(w, f"missing {k}")
        check_source(w, p.get("source"), need_evidence=True)
        if not isinstance(p.get("infoYear"), int):
            err(w, "infoYear missing")
        if p.get("eligibility") not in ("open", "criteria", None):
            err(w, f"eligibility {p.get('eligibility')!r}")
        if p.get("eligibility") is None and not any("eligib" in str(x).lower() for x in p.get("notConfirmed") or []):
            err(w, "eligibility unknown but not listed in notConfirmed")
        for k in ("opens", "deadline", "runs"):
            d = p.get(k) or {}
            check_date(f"{w} {k}", d.get("date") or d.get("start"))
            if (d.get("date") or d.get("start")) and d.get("status") not in ("Confirmed", "Expected"):
                err(w, f"{k} has a date but status {d.get('status')!r}")
    for s in steps:
        w = f"timeline {s.get('id')}"
        if not s.get("title"):
            err(w, "missing title")
        if s.get("now"):
            continue
        check_date(w, s.get("date"))
        if s.get("status") not in ("Confirmed", "Expected"):
            err(w, f"status {s.get('status')!r}")
        if s.get("status") == "Confirmed" and not is_url((s.get("source") or {}).get("url")):
            err(w, "Confirmed date without a source")
        if s.get("status") == "Expected" and not s.get("basedOn"):
            err(w, "Expected date without basedOn")
    for k, g in gloss.items():
        if not g.get("term") or not g.get("short"):
            err(f"glossary {k}", "missing term or short text")
    for k in ("lastChecked", "dataVersion", "home", "leagueTable"):
        if not meta.get(k):
            err("meta", f"missing {k}")
    n_courses = sum(len(u.get("courses") or []) for u in unis)
    print(f"Checked {len(unis)} unis, {n_courses} courses, {len(progs)} programmes, {len(steps)} timeline steps, {len(gloss)} glossary terms.")
    for e in errors:
        print("ERROR  ", e)
    if "--warnings" in sys.argv:
        for wn in warnings:
            print("warning", wn)
    print(f"{len(errors)} errors, {len(warnings)} warnings" + ("" if "--warnings" in sys.argv else " (use --warnings to list)"))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
