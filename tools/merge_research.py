#!/usr/bin/env python3
"""Merge the research files into the app's data files.

Usage: python3 tools/merge_research.py
Reads  research/unis/*.json, research/programmes-national.json, research/timeline.json,
       research/raw/cug-2027-*.json and tools/content/*.json (hand-written app text)
Writes data/universities.json, data/programmes.json, data/timeline.json, data/glossary.json,
       data/subjects.json, data/meta.json
It only reshapes and tidies what the research recorded — it never adds facts.
"""
import datetime as dt
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = lambda *p: os.path.join(ROOT, *p)  # noqa: E731

RUSSELL_GROUP = {  # russellgroup.ac.uk/our-universities, checked 2026-10-17 (minus Oxford and Cambridge)
    "birmingham", "bristol", "cardiff", "durham", "edinburgh", "exeter", "glasgow", "imperial", "kcl", "leeds",
    "liverpool", "lse", "manchester", "newcastle", "nottingham", "qmul", "qub", "sheffield", "southampton", "ucl",
    "warwick", "york",
}
RG_SOURCE = {"url": "https://www.russellgroup.ac.uk/our-universities", "checked": "2026-10-17"}

CUG_NAMES = {  # Complete University Guide 2027 names → app ids
    "London School of Economics and Political Science, University of London": "lse", "Imperial College London": "imperial",
    "Durham University": "durham", "University of Warwick": "warwick", "Loughborough University": "loughborough",
    "University of Bath": "bath", "Lancaster University": "lancaster", "University of Exeter": "exeter",
    "University of Birmingham": "birmingham", "University of Sheffield": "sheffield", "UCL (University College London)": "ucl",
    "University of Southampton": "southampton", "King's College London, University of London": "kcl", "University of Bristol": "bristol",
    "University of Leeds": "leeds", "The University of Edinburgh": "edinburgh", "University of York": "york", "University of Surrey": "surrey",
    "University of Liverpool": "liverpool", "Queen's University Belfast": "qub", "University of Manchester": "manchester",
    "University of Nottingham": "nottingham", "Cardiff University": "cardiff", "University of Glasgow": "glasgow", "University of Essex": "essex",
    "University of Leicester": "leicester", "University of East Anglia UEA": "uea", "Newcastle University": "newcastle",
    "University of Sussex": "sussex", "Northumbria University, Newcastle": "northumbria", "Queen Mary University of London": "qmul",
    "Swansea University": "swansea", "Royal Holloway, University of London": "rhul", "University of Reading": "reading",
    "University of Suffolk": "suffolk", "Oxford Brookes University": "oxford-brookes", "Nottingham Trent University": "ntu",
    "Brunel University of London": "brunel", "Bangor University": "bangor", "University of Lincoln": "lincoln",
    "University of Portsmouth": "portsmouth", "Aston University, Birmingham": "aston", "Manchester Metropolitan University": "mmu",
    "Keele University": "keele", "Aberystwyth University": "aberystwyth", "Coventry University": "coventry", "Edge Hill University": "edge-hill",
    "City St George's, University of London": "city", "Goldsmiths, University of London": "goldsmiths", "University of Kent": "kent",
    "University of Chichester": "chichester", "University of Hull": "hull", "University of Salford": "salford", "University of Plymouth": "plymouth",
    "University of Huddersfield": "huddersfield", "University of Sunderland": "sunderland", "University of Hertfordshire": "herts",
    "University of Derby": "derby", "Cardiff Metropolitan University": "cardiff-met", "Bristol, UWE": "uwe",
    "Liverpool John Moores University": "ljmu", "Bournemouth University": "bournemouth", "SOAS University of London": "soas",
    "University of St Andrews": "st-andrews",
}
CUG = {"name": "Complete University Guide 2027", "year": 2027, "published": "2026-06-02",
       "url": "https://www.thecompleteuniversityguide.co.uk/league-tables/rankings",
       "economicsUrl": "https://www.thecompleteuniversityguide.co.uk/league-tables/rankings/economics", "checked": "2026-10-17"}

# Search nicknames people actually type (search help only, not facts).
EXTRA_ALIASES = {
    "kcl": ["KCL", "Kings", "King's", "Kings College", "King's College"], "lse": ["LSE", "London School of Economics"],
    "ucl": ["UCL", "University College"], "qmul": ["QMUL", "QM", "Queen Mary", "Queen Marys"], "rhul": ["RHUL", "Royal Holloway", "RHUL Egham"],
    "uea": ["UEA", "East Anglia"], "imperial": ["Imperial", "ICL", "Imperial College"], "st-andrews": ["St Andrews", "Saint Andrews", "St Andrew's"],
    "qub": ["QUB", "Queen's Belfast", "Queens Belfast"], "loughborough": ["Lboro", "Lufbra", "Loughborough Uni"],
    "ntu": ["NTU", "Nottingham Trent", "Trent"], "mmu": ["MMU", "Man Met", "Manchester Met"], "ljmu": ["LJMU", "John Moores", "Liverpool John Moores"],
    "uwe": ["UWE", "UWE Bristol", "West of England"], "city": ["City", "City St George's", "City University"], "soas": ["SOAS"],
    "herts": ["Herts", "Hertfordshire", "UH"], "oxford-brookes": ["Brookes", "Oxford Brookes"], "cardiff-met": ["Cardiff Met", "CMU"],
    "edge-hill": ["Edge Hill"], "bournemouth": ["BU", "Bournemouth Uni"], "warwick": ["Warwick", "Warwick Uni"], "bath": ["Bath", "Bath Uni"],
    "durham": ["Durham", "Durham Uni"], "manchester": ["Manchester", "UoM", "Manchester Uni"], "edinburgh": ["Edinburgh", "Edinburgh Uni"],
    "glasgow": ["Glasgow", "Glasgow Uni"], "birmingham": ["Birmingham", "Brum", "UoB"], "aston": ["Aston"], "brunel": ["Brunel"],
}

REGIONS = ["London", "South East", "South West", "East of England", "Midlands", "North", "Wales", "Scotland", "Northern Ireland"]
TYPES = ["economics", "economics-finance", "economics-accounting", "business-economics", "economics-management", "economics-politics",
         "ppe", "economics-geography", "behavioural-economics", "maths-economics", "finance", "accounting-finance",
         "business-management", "real-estate"]
CONTEXT_KEYS = ["area", "fsm", "school", "firstGen", "care", "carer", "estranged", "refugee", "income", "access", "other"]
ALT_TYPES = ["epq", "contextual", "accessProgramme", "summerSchool", "tmua", "other"]

GRADE_RE = re.compile(r"^(A\*|[ABCDE])+$")


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def subjects_list():
    return load(R("tools", "content", "subjects.json"))["subjects"]


def subject_key(name):
    k = re.sub(r"\(.*?\)", " ", str(name or "").lower())
    k = re.sub(r"[^a-z ]+", " ", k)
    k = re.sub(r"\s+", " ", k).strip()
    k = re.sub(r"^(a level|a-level) ", "", k)
    aliases = {"maths": "mathematics", "math": "mathematics", "further maths": "further mathematics",
               "government and politics": "politics", "business studies": "business"}
    return aliases.get(k, k)


def first_grades(s):
    """'A*AC / A*BB' → 'A*AC'; 'AAA-AAB' → 'AAA'; returns None if no grade string found."""
    if not s or not isinstance(s, str):
        return None
    for part in re.split(r"[/,;]| or |–|-|to", s.upper()):
        p = part.strip().replace(" ", "")
        if 2 <= len(p.replace("*", "")) <= 4 and GRADE_RE.match(p):
            return p
    return None


def last_grades(s):
    if not s or not isinstance(s, str):
        return None
    parts = [p.strip().replace(" ", "") for p in re.split(r"–|-| to ", s.upper())]
    good = [p for p in parts if GRADE_RE.match(p or "")]
    return good[-1] if len(good) > 1 else None


def parse_epq_grade(text):
    m = re.search(r"\b(A\*|[A-E])\s*(?:grade\s*)?(?:in|at)\s*(?:an?|the|your)?\s*(?:EPQ|Extended Project)", text or "", re.I)
    if m:
        return m.group(1).upper()
    m = re.search(r"(?:EPQ|Extended Project)[^.]{0,30}?grade\s*(A\*|[A-E])\b", text or "", re.I)
    return m.group(1).upper() if m else None


def parse_tmua_score(text):
    m = re.search(r"(\d(?:\.\d)?)\s*(?:or above|or higher|\+|and above)", text or "", re.I)
    if not m:
        m = re.search(r"(?:score|scoring)\s*(?:of\s*)?(?:at least\s*)?(\d(?:\.\d)?)", text or "", re.I)
    if m:
        v = float(m.group(1))
        return v if 1 <= v <= 9 else None
    return None


def clean_offer(o):
    o = dict(o or {})
    kind = o.get("kind") if o.get("kind") in ("grades", "tariff") else ("tariff" if isinstance(o.get("tariff"), (int, float)) and not o.get("typical") else "grades")
    typical_raw = o.get("typical")
    typical = first_grades(typical_raw)
    low = first_grades(o.get("low")) or (last_grades(typical_raw) if typical_raw else None)
    if low == typical:
        low = None
    out = {"kind": kind, "typical": typical, "low": low,
           "tariff": o.get("tariff") if isinstance(o.get("tariff"), (int, float)) else None,
           "tariffLow": o.get("tariffLow") if isinstance(o.get("tariffLow"), (int, float)) else None,
           "text": o.get("text"), "source": o.get("source")}
    if out["kind"] == "tariff" and out["tariff"] is None:
        out["kind"] = "grades"
    return out


def clean_groups(groups, known):
    out = []
    for g in groups or []:
        subs = [s for s in (g.get("subjects") or []) if s]
        if not subs:
            continue
        canon = []
        checkable = True
        for s in subs:
            k = subject_key(s)
            match = next((n for n in known if subject_key(n) == k), None)
            if match:
                canon.append(match)
            else:
                canon.append(s)
                checkable = False
        mg = g.get("minGrade")
        mg = mg if mg in ("A*", "A", "B", "C", "D", "E") else None
        out.append({"subjects": canon, "minGrade": mg, "note": g.get("note"), "checkable": checkable})
    return out


def clean_alt(a, course_groups, known):
    t = a.get("type") if a.get("type") in ALT_TYPES else "other"
    text = " ".join(filter(None, [a.get("conditions"), (a.get("source") or {}).get("evidence")]))
    offer_raw = a.get("offer")
    offer = first_grades(offer_raw)
    out = {"type": t, "offer": offer, "offerText": offer_raw if offer_raw and offer_raw != offer else None,
           "tariff": a.get("tariff") if isinstance(a.get("tariff"), (int, float)) else None,
           "conditions": a.get("conditions"), "programme": a.get("programme"), "source": a.get("source")}
    if t == "epq":
        out["epqGrade"] = parse_epq_grade(text) or None
    if t == "tmua":
        out["tmuaMinScore"] = parse_tmua_score(text)
    return out


def norm_options(o):
    o = o or {}
    ya = o.get("yearAbroad") if o.get("yearAbroad") in ("optional", "required", "none", "unknown") else "unknown"
    pl = o.get("placement") if o.get("placement") in ("optional", "required", "none", "unknown") else "unknown"
    fy = o.get("foundationYear") if o.get("foundationYear") in ("available", "none", "unknown") else "unknown"
    return {"yearAbroad": ya, "placement": pl, "foundationYear": fy}


POSTCODES = R("research", "cache", "postcodes.json")


def coords_for(postcode, warnings, uid):
    """Look a postcode up on postcodes.io once and cache it (postcodes don't move)."""
    import urllib.request
    pc = re.sub(r"\s+", "", (postcode or "").upper())
    if not pc:
        return None
    cache = load(POSTCODES, {}) or {}
    if pc not in cache:
        for kind in ("postcodes", "terminated_postcodes"):  # retired postcodes still have a location
            try:
                with urllib.request.urlopen(f"https://api.postcodes.io/{kind}/{pc}", timeout=20) as r:
                    res = json.load(r)["result"]
                cache[pc] = {"lat": res["latitude"], "lng": res["longitude"], "source": f"https://api.postcodes.io/{kind}/{pc}"}
                break
            except Exception as e:
                err = e
        else:
            warnings.append(f"{uid}: postcode {postcode} lookup failed ({err})")
            return None
        os.makedirs(os.path.dirname(POSTCODES), exist_ok=True)
        json.dump(cache, open(POSTCODES, "w"), indent=1)
    return cache[pc]


def clean_course(c, uni_id, known, warnings):
    cid = c.get("id") or f"{uni_id}-{re.sub(r'[^a-z0-9]+', '-', (c.get('name') or 'course').lower()).strip('-')}"
    if not cid.startswith(uni_id + "-"):
        cid = f"{uni_id}-{cid}"
    groups = clean_groups(c.get("subjectRequirements"), known)
    types = [t for t in (c.get("types") or []) if t in TYPES]
    if not types:
        warnings.append(f"{cid}: no valid course type")
    comp = c.get("competition") if isinstance(c.get("competition"), dict) else None
    return {
        "id": cid, "name": c.get("name"), "degree": c.get("degree"), "ucasCode": c.get("ucasCode"),
        "lengthYears": c.get("lengthYears"), "lengthNote": c.get("lengthNote"), "options": norm_options(c.get("options")),
        "types": types, "entryYear": c.get("entryYear"), "offer": clean_offer(c.get("offer")),
        "subjectRequirements": groups, "preferredSubjects": c.get("preferredSubjects") or [],
        "furtherMaths": c.get("furtherMaths"), "gcse": [g for g in (c.get("gcse") or []) if isinstance(g, dict)],
        "gcseText": c.get("gcseText"), "notAccepted": c.get("notAccepted") or [],
        "acceptsPsychology": c.get("acceptsPsychology") or "unknown", "acceptsGeography": c.get("acceptsGeography") or "unknown",
        "subjectsEvidence": c.get("subjectsEvidence"), "admissionsTest": c.get("admissionsTest") or {"status": "none"},
        "alternativeOffers": [clean_alt(a, groups, known) for a in (c.get("alternativeOffers") or []) if isinstance(a, dict)],
        "competition": comp, "links": c.get("links") or {}, "notConfirmed": c.get("notConfirmed") or [], "notes": c.get("notes"),
        "notOpen": c.get("notOpen"),
    }


def clean_contextual(ctx):
    if not isinstance(ctx, dict):
        return None
    crit = []
    for c in ctx.get("criteria") or []:
        if not isinstance(c, dict) or c.get("key") not in CONTEXT_KEYS:
            continue
        q = [int(x) for x in (c.get("quintiles") or []) if str(x).isdigit()]
        crit.append({"key": c["key"], "detail": c.get("detail"), "measure": c.get("measure"), "quintiles": q,
                     "threshold": c.get("threshold"), "alone": c.get("alone") if c.get("alone") in (True, False) else None})
    mc = ctx.get("minCriteria")
    return {"offersContextual": ctx.get("offersContextual"), "summary": ctx.get("summary"), "typicalReduction": ctx.get("typicalReduction"),
            "criteria": crit, "minCriteria": mc if isinstance(mc, int) and mc > 0 else None, "rulesText": ctx.get("rulesText"),
            "url": ctx.get("url"), "source": ctx.get("source")}


def clean_programme(p, default_uni=None):
    p = dict(p)
    p.setdefault("providerType", "university" if default_uni else "charity")
    if default_uni and default_uni not in (p.get("uniIds") or []):
        p["uniIds"] = [default_uni, *(p.get("uniIds") or [])]
    p["uniIds"] = list(dict.fromkeys(p.get("uniIds") or []))
    p["lowersOfferAt"] = list(dict.fromkeys(p.get("lowersOfferAt") or []))
    p["lowersOffer"] = bool(p.get("lowersOffer")) or bool(p["lowersOfferAt"])
    for k in ("opens", "deadline", "runs"):
        d = p.get(k)
        if isinstance(d, dict):
            if d.get("date") and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(d["date"])):
                d["date"] = None
            if k == "opens" and re.search(r"\bopen (now|until)\b|now open|applications are open", str(d.get("text") or ""), re.I):
                d["isOpen"] = True
    if p.get("format") not in ("online", "day", "residential", "mixed"):
        p["format"] = None
    return p


def walk_checked(obj, out):
    if isinstance(obj, dict):
        if isinstance(obj.get("checked"), str) and re.match(r"^\d{4}-\d{2}-\d{2}$", obj["checked"]):
            out["dates"].append(obj["checked"])
        if isinstance(obj.get("url"), str) and obj["url"].startswith("http"):
            out["urls"].add(obj["url"].split("#")[0])
        for v in obj.values():
            walk_checked(v, out)
    elif isinstance(obj, list):
        for v in obj:
            walk_checked(v, out)


def main():
    warnings = []
    known = subjects_list()
    overall = {CUG_NAMES.get(r["name"]): r["rank"] for r in load(R("research", "raw", "cug-2027-overall.json"), [])}
    econ = {CUG_NAMES.get(r["name"]): r["rank"] for r in load(R("research", "raw", "cug-2027-economics.json"), [])}
    unis, programmes = [], {}
    for path in sorted(glob.glob(R("research", "unis", "*.json"))):
        u = load(path)
        uid = u.get("id") or os.path.splitext(os.path.basename(path))[0]
        if not u.get("courses"):
            warnings.append(f"{uid}: no courses (skipped)")
            continue
        loc = dict(u.get("location") or {})
        if not isinstance(loc.get("lat"), (int, float)) and loc.get("postcode"):
            found = coords_for(loc["postcode"], warnings, uid)
            if found:
                loc.update(lat=found["lat"], lng=found["lng"], coordsSource=found["source"], checked=loc.get("checked") or dt.date.today().isoformat())
        aliases = list(dict.fromkeys([*(u.get("aliases") or []), *EXTRA_ALIASES.get(uid, [])]))
        region = u.get("region") if u.get("region") in REGIONS else None
        if not region:
            warnings.append(f"{uid}: region '{u.get('region')}' not in list")
        courses = [clean_course(c, uid, known, warnings) for c in u.get("courses") or []]
        for p in u.get("programmes") or []:
            if isinstance(p, dict) and p.get("id"):
                programmes[p["id"]] = clean_programme(p, uid)
        unis.append({
            "id": uid, "name": u.get("name"), "shortName": u.get("shortName") or u.get("name"), "aliases": aliases,
            "city": u.get("city"), "region": region, "country": u.get("country"), "setting": u.get("setting"),
            "settingEvidence": u.get("settingEvidence"),
            "russellGroup": uid in RUSSELL_GROUP, "russellGroupSource": RG_SOURCE,
            "location": {"lat": loc.get("lat"), "lng": loc.get("lng"), "postcode": loc.get("postcode"),
                         "source": loc.get("coordsSource"), "postcodeSource": loc.get("postcodeSource"), "checked": loc.get("checked")},
            "rank": {"overall": overall.get(uid), "economics": econ.get(uid), "table": CUG["name"], "source": {"url": CUG["url"], "checked": CUG["checked"]}},
            "fees": u.get("fees"), "livingCosts": u.get("livingCosts"), "openDays": u.get("openDays"),
            "contextual": clean_contextual(u.get("contextual")), "links": u.get("links") or {},
            "notes": u.get("notes") or [], "notConfirmed": u.get("notConfirmed") or [], "courses": courses,
        })
    national = load(R("research", "programmes-national.json"), {"programmes": []})
    for p in national.get("programmes", []):
        if isinstance(p, dict) and p.get("id"):
            programmes[p["id"]] = clean_programme(p)
    valid_ids = {u["id"] for u in unis}
    for p in programmes.values():
        p["uniIds"] = [x for x in p["uniIds"] if x in valid_ids]
        p["lowersOfferAt"] = [x for x in p["lowersOfferAt"] if x in valid_ids]

    content = load(R("tools", "content", "timeline-text.json"))
    research_tl = load(R("research", "timeline.json"), {"facts": [], "reference": {}})
    facts = {f["id"]: f for f in research_tl.get("facts", [])}
    steps = []
    for s in content["steps"]:
        step = dict(s)
        f = facts.get(s.get("fact"))
        if f:
            step.setdefault("date", f.get("date"))
            step.setdefault("endDate", f.get("endDate"))
            step["status"] = f.get("status")
            step["basedOn"] = f.get("basedOn")
            step["source"] = f.get("source")
        elif s.get("fact"):
            warnings.append(f"timeline: fact {s['fact']} not found")
            continue
        if s.get("sourceRef"):
            src = ((research_tl.get("reference") or {}).get(s["sourceRef"]) or {}).get("source")
            if src:
                step["source"] = src
            else:
                warnings.append(f"timeline: sourceRef {s['sourceRef']} missing")
        steps.append(step)
    steps.sort(key=lambda s: s.get("date") or "9999")

    out = {"dates": [], "urls": set()}
    walk_checked(unis, out)
    walk_checked(list(programmes.values()), out)
    walk_checked(steps, out)
    ref = research_tl.get("reference") or {}
    meta = {
        "home": {"name": "Bournemouth town centre (The Square)", "lat": 50.7202084, "lng": -1.8794037,
                 "source": "https://www.openstreetmap.org/way/1213063868", "checked": "2026-10-17"},
        "leagueTable": CUG, "cycleYear": 2027, "startYear": 2028,
        "lastChecked": max(out["dates"]) if out["dates"] else None,
        "oldestChecked": min(out["dates"]) if out["dates"] else None,
        "entryYears": sorted({c["entryYear"] for u in unis for c in u["courses"] if c.get("entryYear")}),
        "counts": {"unis": len(unis), "courses": sum(len(u["courses"]) for u in unis), "programmes": len(programmes)},
        "sourceCount": len(out["urls"]),
        "tmuaUrl": "https://esat-tmua.ac.uk/about-the-tests/tmua-test/",
        "reference": {
            "polarCheckerUrl": (ref.get("polarChecker") or {}).get("url") or "https://www.officeforstudents.org.uk/data-and-analysis/young-participation-by-area/search-by-postcode/",
            "schoolPerformanceUrl": "https://www.gov.uk/school-performance-tables",
        },
    }
    files = {
        "universities.json": {"unis": unis},
        "programmes.json": {"programmes": sorted(programmes.values(), key=lambda p: p["name"])},
        "timeline.json": {"steps": steps},
        "glossary.json": load(R("tools", "content", "glossary.json")),
        "subjects.json": {"subjects": known},
    }
    digest = hashlib.sha1(json.dumps(files, sort_keys=True).encode()).hexdigest()[:12]
    meta["dataVersion"] = f"{meta['lastChecked']}-{digest}"
    files["meta.json"] = meta
    os.makedirs(R("data"), exist_ok=True)
    for name, obj in files.items():
        with open(R("data", name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    print(f"Merged {meta['counts']['unis']} unis, {meta['counts']['courses']} courses, {meta['counts']['programmes']} programmes, "
          f"{len(steps)} timeline steps, {meta['sourceCount']} sources.")
    for w in warnings:
        print("WARN", w)


if __name__ == "__main__":
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        sys.exit(0)
    main()
