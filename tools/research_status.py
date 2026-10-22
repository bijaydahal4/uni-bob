#!/usr/bin/env python3
"""Research ledger: what's done, what's missing, what's out of date — and a work packet per uni.

Usage:
  python3 tools/research_status.py                 table of every uni (writes research/status.json)
  python3 tools/research_status.py --packets       also write research/packets/<uni>.md for unis with work to do
  python3 tools/research_status.py --packets bath  just these unis

A work packet tells a researcher exactly what to fill, which official pages are already cached (so they are
read from the cache, never re-downloaded), and which shared facts already answer questions for that uni.
Expiry rules (EXPIRY below) decide when a time-sensitive fact must be re-checked.
"""
import collections
import datetime as dt
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pagecache  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAY = dt.date.today()

# Re-check a fact once it is older than this many days (time-sensitive facts expire sooner).
EXPIRY = {
    "course": 120,      # offers, subjects, tests: also re-check for 2028 entry from February 2027
    "fees": 180,
    "livingCosts": 365,
    "openDays": 30,     # and as soon as the last listed open day has passed
    "contextual": 180,
    "programme": 30,    # and every 14 days when a deadline is within 60 days
    "location": 100000,
}

ALL_UNIS = {  # app id → official name (the brief's list; see research/BATCHES.md)
    "lse": "London School of Economics and Political Science", "imperial": "Imperial College London", "durham": "Durham University",
    "warwick": "University of Warwick", "loughborough": "Loughborough University", "bath": "University of Bath",
    "lancaster": "Lancaster University", "exeter": "University of Exeter", "birmingham": "University of Birmingham",
    "sheffield": "University of Sheffield", "ucl": "University College London", "southampton": "University of Southampton",
    "kcl": "King's College London", "bristol": "University of Bristol", "leeds": "University of Leeds",
    "edinburgh": "The University of Edinburgh", "york": "University of York", "surrey": "University of Surrey",
    "liverpool": "University of Liverpool", "qub": "Queen's University Belfast", "manchester": "The University of Manchester",
    "nottingham": "University of Nottingham", "cardiff": "Cardiff University", "glasgow": "University of Glasgow",
    "essex": "University of Essex", "leicester": "University of Leicester", "uea": "University of East Anglia",
    "newcastle": "Newcastle University", "sussex": "University of Sussex", "northumbria": "Northumbria University",
    "qmul": "Queen Mary University of London", "swansea": "Swansea University", "rhul": "Royal Holloway, University of London",
    "reading": "University of Reading", "suffolk": "University of Suffolk", "oxford-brookes": "Oxford Brookes University",
    "ntu": "Nottingham Trent University", "brunel": "Brunel University of London", "bangor": "Bangor University",
    "lincoln": "University of Lincoln", "portsmouth": "University of Portsmouth", "aston": "Aston University",
    "mmu": "Manchester Metropolitan University", "keele": "Keele University", "aberystwyth": "Aberystwyth University",
    "coventry": "Coventry University", "edge-hill": "Edge Hill University", "city": "City St George's, University of London",
    "goldsmiths": "Goldsmiths, University of London", "kent": "University of Kent", "chichester": "University of Chichester",
    "hull": "University of Hull", "salford": "University of Salford", "plymouth": "University of Plymouth",
    "huddersfield": "University of Huddersfield", "sunderland": "University of Sunderland", "herts": "University of Hertfordshire",
    "derby": "University of Derby", "cardiff-met": "Cardiff Metropolitan University", "uwe": "University of the West of England",
    "ljmu": "Liverpool John Moores University", "bournemouth": "Bournemouth University", "soas": "SOAS University of London",
    "st-andrews": "University of St Andrews",
}
LEGACY_FOLDERS = {"b08": ("mmu",), "b09": ("hull",), "b10": ("bournemouth",)}


def days_since(d):
    try:
        return (TODAY - dt.date.fromisoformat(str(d)[:10])).days
    except ValueError:
        return None


def sites_from_scratch():
    """Infer each uni's website from pages earlier researchers saved under research/tmp/<uni>/."""
    out = {}
    for folder in glob.glob(os.path.join(ROOT, "research", "tmp", "*")):
        name = os.path.basename(folder)
        unis = LEGACY_FOLDERS.get(name, (name,) if name in ALL_UNIS else ())
        if not unis or not os.path.isdir(folder):
            continue
        sites = collections.Counter()
        for p in glob.glob(os.path.join(folder, "*.txt")):
            m = re.search(r"^URL: (\S+)", open(p, encoding="utf-8", errors="replace").read(400), re.M)
            if m and not re.search(r"ucas\.com|postcodes\.io|gov\.uk", m.group(1)):
                sites[pagecache.site_of(m.group(1))] += 1
        if sites:
            out[unis[0]] = sites.most_common(1)[0][0]
    return out


def cached_pages(site):
    pages = []
    for mp in glob.glob(os.path.join(pagecache.PAGES, "*.json")):
        try:
            m = json.load(open(mp, encoding="utf-8"))
        except ValueError:
            continue
        if pagecache.site_of(m.get("url", "")) == site and m.get("chars", 0) >= pagecache.MIN_CHARS:
            pages.append(m)
    return sorted(pages, key=lambda m: m["url"])


TOPICS = ["Courses and entry requirements", "Fees and funding", "Accommodation and living costs", "Open days and visits",
          "Contextual offers, outreach and summer schools", "Other"]


def topic_of(url, title=""):
    t = (url + " " + title).lower()
    if re.search(r"accommodation|living-cost|living cost|halls|rent|budget|cost-of-living", t):
        return "Accommodation and living costs"
    if re.search(r"fee|tuition|funding|bursar|scholarship", t):
        return "Fees and funding"
    if re.search(r"open-?day|visit|campus-tour", t):
        return "Open days and visits"
    if re.search(r"contextual|widening|outreach|access|summer|post-16|scholars|pathway|year-12|taster|aspire", t):
        return "Contextual offers, outreach and summer schools"
    if re.search(r"course|undergraduate|programme|degree|entry|econom|financ|account|business|manag|politic|ppe|admission", t):
        return "Courses and entry requirements"
    return "Other"


def gaps_for(u):
    gaps, stale = [], []
    for key in ("fees", "livingCosts", "openDays", "contextual"):
        block = u.get(key)
        src = (block or {}).get("source") or {}
        if not block or not src.get("url"):
            gaps.append(f"{key}: missing")
        elif (days_since(src.get("checked")) or 0) > EXPIRY[key]:
            stale.append(f"{key}: checked {src.get('checked')} (expires after {EXPIRY[key]} days)")
    events = (u.get("openDays") or {}).get("events") or []
    if events and all((days_since(e.get("endDate") or e.get("date")) or 0) > 0 for e in events):
        stale.append("openDays: every listed open day has passed")
    loc = u.get("location") or {}
    if not loc.get("postcode"):
        gaps.append("location: postcode missing")
    courses = u.get("courses") or []
    if len(courses) < 2 and not any("course" in str(n).lower() for n in u.get("notes") or []):
        gaps.append(f"courses: only {len(courses)} recorded (aim for about 6 if the uni offers them)")
    for c in courses:
        o = c.get("offer") or {}
        if not (o.get("typical") or o.get("tariff")):
            gaps.append(f"{c.get('id')}: offer not confirmed")
        elif (days_since((o.get("source") or {}).get("checked")) or 0) > EXPIRY["course"]:
            stale.append(f"{c.get('id')}: offer checked {(o.get('source') or {}).get('checked')}")
        if c.get("entryYear") == 2027 and TODAY >= dt.date(2027, 2, 1):
            stale.append(f"{c.get('id')}: check whether 2028-entry requirements are out")
    for p in u.get("programmes") or []:
        missing = [k for k in ("name", "url", "infoYear", "summary") if not p.get(k)]
        if not (p.get("source") or {}).get("url"):
            missing.append("source")
        if missing:
            gaps.append(f"programme {p.get('id')}: missing {', '.join(missing)}")
        d = (p.get("deadline") or {}).get("date")
        checked = (p.get("source") or {}).get("checked")
        if d and (days_since(d) or 0) > 0 and p.get("infoYear", 0) <= TODAY.year:
            stale.append(f"programme {p.get('id')}: deadline {d} has passed — look for the next round")
        elif d and 0 <= -(days_since(d) or 0) <= 60 and (days_since(checked) or 0) > 14:
            stale.append(f"programme {p.get('id')}: deadline {d} is near — re-check")
        elif (days_since(checked) or 0) > EXPIRY["programme"]:
            stale.append(f"programme {p.get('id')}: checked {checked}")
    return gaps, stale


def gap_hints(u, items, site):
    """Point each gap at the field path and the cached page most likely to answer it."""
    hints = []
    pages = cached_pages(site) if site else []
    by_topic = collections.defaultdict(list)
    for p in pages:
        by_topic[topic_of(p["url"], p.get("title", ""))].append(p["url"])
    topic_for = {"fees": "Fees and funding", "livingCosts": "Accommodation and living costs", "openDays": "Open days and visits",
                 "contextual": "Contextual offers, outreach and summer schools"}
    for g in items:
        m = re.match(r"programme (\S+): missing (.+)", g)
        if m:
            prog = next((p for p in u.get("programmes") or [] if p.get("id") == m.group(1)), {})
            url = prog.get("url") or (prog.get("source") or {}).get("url")
            for field in [f.strip() for f in m.group(2).split(",")]:
                hints.append(f"- `programmes[id={m.group(1)}].{field}` — read {url}")
            continue
        m = re.match(r"programme (\S+): (deadline|checked)", g)
        if m:
            prog = next((p for p in u.get("programmes") or [] if p.get("id") == m.group(1)), {})
            url = prog.get("url") or (prog.get("source") or {}).get("url")
            hints.append(f"- `programmes[id={m.group(1)}]` — re-read {url} and update `opens`, `deadline`, `runs`, `infoYear` "
                         "(and `infoNote`) for the next round; if it isn't announced yet, keep the old dates, set "
                         "`infoNote` to say so, and use --not-confirmed for the new dates")
            continue
        key = g.split(":")[0]
        if key in topic_for:
            urls = by_topic.get(topic_for[key], [])[:3]
            hints.append(f"- `{key}` — cached pages: {', '.join(urls) if urls else 'none cached; find the official page'}")
    return hints


def shared_for(uid, shared):
    lines = []
    t = (shared.get("tmua2027") or {})
    if t:
        rows = t["unis"].get(uid)
        if rows:
            listed = "; ".join(f"{c['name']} ({c['ucasCode']}): TMUA {c['rule']}" for c in rows["courses"])
            lines.append(f"- TMUA (official UAT-UK list, 2027 entry, {t['source']['url']}): {listed}. Use this; "
                         "only check the course page for what a score does (e.g. lower offers).")
        else:
            lines.append(f"- TMUA: this uni is NOT on UAT-UK's official TMUA list for 2027 entry ({t['source']['url']}). "
                         "Don't search for the TMUA; record a test only if a course page names one.")
    national = os.path.join(ROOT, "research", "programmes-national.json")
    if os.path.exists(national):
        progs = json.load(open(national, encoding="utf-8")).get("programmes", [])
        mine = [p for p in progs if uid in (p.get("uniIds") or []) or uid in (p.get("lowersOfferAt") or [])]
        for p in mine:
            lines.append(f"- National programme already researched: {p['name']} (lowers offer here: "
                         f"{'yes' if uid in (p.get('lowersOfferAt') or []) else 'not stated'}). Only record this uni's own "
                         "alternative offer for it if the uni's page states one.")
    return lines


def packet(uid, u, site, shared, gaps, stale):
    name = (u or {}).get("name") or ALL_UNIS.get(uid, uid)
    L = [f"# Work packet: {name} ({uid})", "", f"Today: {TODAY.isoformat()}. Save to research/unis/{uid}.json "
         f"(builder script research/tmp/build/{uid}.py), then run tools/check_evidence.py on it.", ""]
    if u:
        L += ["## Already done — keep it, don't re-research it",
              f"- {len(u.get('courses') or [])} courses: " + "; ".join(f"{c.get('name')} ({(c.get('offer') or {}).get('typical') or (c.get('offer') or {}).get('tariff')})" for c in u.get("courses") or []),
              "- Edit the existing builder script (or the JSON) to fill only the gaps below.", ""]
        L += ["## Fill these gaps"] + [f"- {g}" for g in gaps] + ([""] if gaps else ["- (none)", ""])
        hints = gap_hints(u, gaps + stale, site)
        if hints:
            L += ["How to fill them (2–4 tool calls in total; see 'Filling a gap' in research/INSTRUCTIONS.md):"] + hints + [""]
        L += ["## Re-check these (expired or time-sensitive)"] + [f"- {s}" for s in stale] + ([""] if stale else ["- (none)", ""])
    else:
        L += ["## Not researched yet",
              "- Find the uni's undergraduate course pages for the main Economics degree(s) and the best matches from the "
              "course list in research/INSTRUCTIONS.md (about 6 courses, 8 at most), plus its fees, accommodation costs, "
              "open days, contextual admissions and Year 12 outreach pages.", ""]
    L += ["## Shared facts that already answer some questions"] + (shared or ["- (none)"]) + [""]
    pages = cached_pages(site) if site else []
    if pages:
        groups = collections.OrderedDict((k, []) for k in TOPICS)
        for p in pages:
            groups[topic_of(p["url"], p.get("title", ""))].append(p)
        L += [f"## Official pages already cached ({len(pages)}), by topic",
              "Read only the groups your gaps need, with one digest.py call per group (cached pages cost nothing to re-read):", ""]
        for topic, items in groups.items():
            if not items:
                continue
            L.append(f"### {topic} ({len(items)})")
            L.append(f"python3 tools/digest.py {uid} --topic {'courses' if topic == 'Courses and entry requirements' else 'uni'} --max 40 "
                     + " ".join(p["url"] for p in items[:12]))
            L += [f"- {p['url']} — {p.get('title', '')[:70]}" for p in items[:20]]
            L.append("")
    return "\n".join(L)


def main():
    write_packets = "--packets" in sys.argv
    only = {a for a in sys.argv[1:] if not a.startswith("--")}
    shared = json.load(open(os.path.join(ROOT, "research", "shared.json"), encoding="utf-8")) if os.path.exists(
        os.path.join(ROOT, "research", "shared.json")) else {}
    scratch_sites = sites_from_scratch()
    rows = []
    for uid in ALL_UNIS:
        path = os.path.join(ROOT, "research", "unis", f"{uid}.json")
        u = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else None
        if u and not u.get("courses"):
            u = None
        site = pagecache.site_of((u or {}).get("links", {}).get("home", "")) if u else scratch_sites.get(uid)
        gaps, stale = gaps_for(u) if u else (["everything"], [])
        status = "missing" if not u else "complete" if not gaps and not stale else "needs work"
        n_cached = len(cached_pages(site)) if site else 0
        rows.append({"uni": uid, "status": status, "courses": len((u or {}).get("courses") or []), "gaps": gaps,
                     "stale": stale, "site": site, "cachedPages": n_cached})
        if write_packets and (not only or uid in only) and status != "complete":
            os.makedirs(os.path.join(ROOT, "research", "packets"), exist_ok=True)
            open(os.path.join(ROOT, "research", "packets", f"{uid}.md"), "w", encoding="utf-8").write(
                packet(uid, u, site, shared_for(uid, shared), gaps, stale))
    json.dump({"date": TODAY.isoformat(), "unis": rows}, open(os.path.join(ROOT, "research", "status.json"), "w"), indent=1)
    by = collections.Counter(r["status"] for r in rows)
    print(f"{len(rows)} unis: {by['complete']} complete, {by['needs work']} need work, {by['missing']} not researched.")
    for r in rows:
        if not only or r["uni"] in only:
            extra = f"{len(r['gaps'])} gaps, {len(r['stale'])} to re-check" if r["status"] == "needs work" else ""
            print(f"  {r['uni']:15}{r['status']:12}{r['courses']:>3} courses  {r['cachedPages']:>3} cached pages  {extra}")
    if write_packets:
        print("Work packets written to research/packets/")


if __name__ == "__main__":
    main()
