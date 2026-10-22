#!/usr/bin/env python3
"""Automated verification of every course's key facts against its official page.

Usage:
  python3 tools/auto_verify.py [uni …] [--fresh]

For each course it re-opens the offer's source page (from the shared cache, or a new download with --fresh)
and checks that:
  1. the evidence quote is really on the page;
  2. the recorded typical offer (and range / tariff) appears in that quote or in the page's A-level text;
  3. each required subject grade (e.g. "A in Mathematics") appears in the quotes or on the page;
  4. the admissions test matches the page and the official UAT-UK TMUA list (research/shared.json);
  5. the page mentions the recorded entry year.
Courses that pass are marked verified; anything else is listed for a person or a fresh subagent to review,
so the expensive manual verification pass only covers what a script can't confirm.
Writes research/verify/auto.json.
"""
import datetime as dt
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pagecache  # noqa: E402
from check_evidence import found, norm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBJECT_WORDS = {"mathematics": r"math", "further mathematics": r"further math", "economics": r"econom", "physics": r"physics"}


def compact(s):
    return re.sub(r"\s+", "", (s or "").upper())


def grade_in(grades, text):
    """Is the grade string (e.g. A*AA) written in the text, allowing spaces or commas between grades?"""
    if not grades:
        return False
    pat = r"\s*,?\s*".join(re.escape(g) for g in re.findall(r"A\*|[A-E]", grades))
    return re.search(r"(?<![A-Z*])" + pat + r"(?![A-Z*])", (text or "").upper()) is not None


def near_a_level(page, needle_fn, span=400):
    """Find the needle within the page's A-level sections."""
    up = page.upper()
    for m in re.finditer(r"A[- ]?LEVEL|A LEVELS|TYPICAL OFFER|ENTRY REQUIREMENT", up):
        if needle_fn(up[max(0, m.start() - 80): m.end() + span]):
            return True
    return False


def subject_ok(g, texts, page):
    words = [SUBJECT_WORDS.get(s.lower(), re.escape(s.lower()[:6])) for s in g["subjects"]]
    grade = g.get("minGrade")
    joined = " ".join(t for t in texts if t)
    rx = re.compile(r"(" + "|".join(words) + r")", re.I)
    if not grade:
        return bool(rx.search(joined)) or bool(rx.search(page)), "subject named"
    gr = re.escape(grade)
    pair = re.compile(rf"((?<![A-Z*]){gr}(?![A-Z*])[^.;]{{0,60}}({'|'.join(words)}))|(({'|'.join(words)})[^.;]{{0,40}}(?<![A-Z*]){gr}(?![A-Z*]))", re.I)
    if pair.search(joined):
        return True, "in quote"
    if pair.search(page):
        return True, "on page"
    return False, f"couldn't find {grade} in {' or '.join(g['subjects'])}"


def verify_course(u, c, shared, max_age):
    o = c.get("offer") or {}
    src = o.get("source") or {}
    res = {"id": c["id"], "checks": {}, "problems": [], "weak": []}
    if not (o.get("typical") or o.get("tariff")):
        res["status"] = "not confirmed"
        return res
    url = src.get("url") or (c.get("links") or {}).get("course")
    page, meta, how = pagecache.get(url, max_age) if url else (None, None, "no url")
    if not page:
        res["status"] = "review"
        res["problems"].append(f"couldn't open source ({how})")
        return res
    res["fetched"] = meta["fetched"]
    ev = src.get("evidence") or ""
    # 1. quote on page (some sites load entry requirements with scripts: retry in a real browser before flagging)
    if ev and not found(ev, page) and meta.get("method") != "browser":
        bpage, bmeta, bhow = pagecache.get(url, 0, browser="always")
        if bpage and found(ev, bpage):
            page, meta = bpage, bmeta
            res["fetched"] = meta["fetched"]
    if ev and not found(ev, page):
        res["problems"].append("offer quote not on the page")
    # 2. offer value
    texts = [ev, o.get("text"), (c.get("subjectsEvidence") or {}).get("evidence")]
    if o.get("typical"):
        if any(grade_in(o["typical"], t) for t in texts if t):
            res["checks"]["offer"] = "in quote"
        elif near_a_level(page, lambda s: grade_in(o["typical"], s)):
            res["checks"]["offer"] = "on page"
            res["weak"].append("offer found on the page but not in the quote")
        else:
            res["problems"].append(f"offer {o['typical']} not found on the page")
    if o.get("low") and not (any(grade_in(o["low"], t) for t in texts if t) or near_a_level(page, lambda s: grade_in(o["low"], s))):
        res["problems"].append(f"range bottom {o['low']} not found on the page")
    if isinstance(o.get("tariff"), (int, float)):
        if not re.search(rf"\b{int(o['tariff'])}\b", " ".join(t for t in texts if t) + " " + page):
            res["problems"].append(f"tariff {o['tariff']} not found on the page")
    # 3. subject grades
    for g in c.get("subjectRequirements") or []:
        if g.get("checkable") is False:
            continue
        ok, why = subject_ok(g, texts, page)
        if not ok:
            res["problems"].append(why)
        elif why == "on page":
            res["weak"].append(f"{g.get('minGrade') or ''} {'/'.join(g['subjects'])} found on the page, not in a quote".strip())
    # 4. admissions test
    t = c.get("admissionsTest") or {}
    status = t.get("status") or "none"
    tm = ((shared.get("tmua2027") or {}).get("unis") or {}).get(u["id"])
    if tm:
        rows = [r for r in tm["courses"] if r["ucasCode"] == c.get("ucasCode")]
        if rows:
            expected = {"compulsory": "required", "recommended": "optional"}.get(rows[0]["rule"])
            if expected and status != expected:
                res["problems"].append(f"TMUA recorded as '{status}' but UAT-UK's 2027 list says {rows[0]['rule']}")
            else:
                res["checks"]["test"] = "matches UAT-UK list"
    if "test" not in res["checks"]:
        # Ignore menu items and headings (short lines like "Admissions Tests (TMUA)" in a site menu).
        sentences = [x for x in re.split(r"(?<=[.!?])\s+|\n", page)
                     if re.search(r"\bTMUA\b|Test of Mathematics for University Admission", x, re.I) and len(x.split()) >= 6]
        negative = re.compile(r"\bdo(?:es)? not (?:consider|include|require|use|accept|need)|don't (?:consider|include|require|use|need)|"
                              r"not (?:be )?(?:required|needed|accepted|considered|a requirement)|no admissions test|isn't required|not part of", re.I)
        if status == "none" and sentences and not all(negative.search(x) for x in sentences):
            res["problems"].append("page mentions the TMUA but no test is recorded: \"" + sentences[0].strip()[:120] + "\"")
        elif status in ("required", "optional") and t.get("name"):
            tokens = re.findall(r"TMUA|STEP|MAT|ESAT|TARA|LNAT|UCAT|TSA", t["name"].upper()) or [t["name"]]
            tsrc = (t.get("source") or {}).get("url")
            tp = pagecache.get(tsrc, max_age)[0] if tsrc and tsrc != url else ""
            if not any(re.search(rf"\b{re.escape(k)}\b", page + " " + (tp or ""), re.I) for k in tokens):
                res["problems"].append(f"{t['name']} not found on the course or test page")
    # 5. entry year
    year = str(c.get("entryYear") or "")
    if year and not re.search(rf"{year}|{int(year) - 1}/{year[-2:]}|{year}/{int(year[-2:]) + 1}", page):
        res["weak"].append(f"page doesn't mention {year}")
    res["status"] = "review" if res["problems"] else ("verified" if not res["weak"] else "verified (weak)")
    return res


def main():
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
        return
    fresh = "--fresh" in sys.argv
    only = {a for a in sys.argv[1:] if not a.startswith("--")}
    max_age = 0 if fresh else pagecache.DEFAULT_MAX_AGE
    shared_path = os.path.join(ROOT, "research", "shared.json")
    shared = json.load(open(shared_path, encoding="utf-8")) if os.path.exists(shared_path) else {}
    out_path = os.path.join(ROOT, "research", "verify", "auto.json")
    old = json.load(open(out_path, encoding="utf-8")) if os.path.exists(out_path) else {"courses": {}}
    results = dict(old.get("courses", {}))
    counts = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "research", "unis", "*.json"))):
        u = json.load(open(path, encoding="utf-8"))
        if only and u["id"] not in only:
            continue
        for c in u.get("courses") or []:
            r = verify_course(u, c, shared, max_age)
            r["checked"] = dt.date.today().isoformat()
            results[c["id"]] = r
            counts[r["status"]] = counts.get(r["status"], 0) + 1
            if r["status"] == "review":
                print(f"REVIEW  {c['id']}: " + "; ".join(r["problems"]))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    json.dump({"date": dt.date.today().isoformat(), "courses": results}, open(out_path, "w", encoding="utf-8"), indent=1)
    total = sum(counts.values())
    print(f"\n{total} courses: " + ", ".join(f"{v} {k}" for k, v in sorted(counts.items())) + (" (fresh downloads)" if fresh else " (cached pages)"))


if __name__ == "__main__":
    main()
