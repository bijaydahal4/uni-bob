# Refreshing Uni Bob's data

Do this every few months (the app warns when data is more than 4 months old), and in particular when unis publish
**2028-entry** requirements (usually spring–summer 2027). Follow `CLAUDE.md` throughout.

## 0. Get ready
1. Run `date` and use today's date everywhere.
2. If the project isn't on this computer: `git clone https://github.com/<username>/uni-bob.git` and `cd uni-bob`.
3. Set up the tools (once): `python3 -m venv .venv && .venv/bin/pip install playwright && .venv/bin/python -m playwright install webkit chromium`.

## 1. See what changed and what's due
1. `python3 tools/check_links.py` — lists broken links, pages blocked to scripts, and pages whose content
   changed since the last check (`research/link-report.md`). Start with changed and broken pages.
2. `python3 tools/shared_facts.py` — refresh facts that one official source answers for many unis (e.g. UAT-UK's
   TMUA course list; update the URL in the script when UAT-UK publishes the 2028-entry list).
3. `python3 tools/research_status.py --packets` — applies the expiry rules (offers 120 days, fees 180, open days 30
   or once passed, programme deadlines) and writes a work packet per uni listing only what's due.

## 2. Re-check every source
1. For every uni in `research/unis/`, re-check its course pages, fees, living costs, open days, contextual
   admissions and programmes on the official websites, following `research/INSTRUCTIONS.md` (same rules: official
   sources only, record source URL, today's date and entry year, never guess).
   - Work with one subagent per uni, in groups of 6–8. Each starts from its packet (`research/packets/<uni>.md`),
     re-checks only what's due, and reads pages through the shared cache (about 3–12 tool calls per uni).
   - Pages whose content hash hasn't changed since the last check (`check_links.py`) can usually keep their facts:
     re-confirm them cheaply with `python3 tools/auto_verify.py --fresh`.
   - Start with the gaps in `DATA_REPORT.md` ("Not confirmed"), e.g. a uni whose website was down last time.
2. **Switch to 2028 entry** for every uni that has published 2028-entry requirements, and set `entryYear: 2028`.
   Keep 2027 only where 2028 isn't out yet.
3. **Summer schools:** update `research/programmes-national.json` and each uni's `programmes` for the current
   year: new dates, opening dates and deadlines, anything new or discontinued. Set `infoYear` correctly.
4. **Timeline:** in `research/timeline.json`, change `Expected` dates to `Confirmed` once UCAS, UAT-UK (TMUA),
   JCQ or Student Finance England publish them, with the source. Update `tools/content/timeline-text.json` if
   steps change.
5. Fix or replace broken links. Pages blocked to scripts (e.g. UCL) need checking in a normal browser.
6. Check each researched file: `python3 tools/check_evidence.py research/unis/<id>.json`.

## 3. Rebuild and verify
1. `python3 tools/merge_research.py` (rebuilds `/data`, including "last checked").
2. **Verification pass:** `python3 tools/auto_verify.py --fresh` re-opens every course's source and checks the
   quote, offer, subject grades, admissions test and entry year automatically. Send every REVIEW item (and a small
   sample of "verified (weak)" ones) to fresh subagents (`research/INSTRUCTIONS.md` §7). Fix anything wrong.
3. `python3 tools/validate_data.py` (must show 0 errors).
4. `.venv/bin/python tools/run_tests.py` and `.venv/bin/python tools/e2e.py` (must pass).
5. `python3 tools/check_links.py --update` to store the new page hashes.
6. Regenerate the report: `python3 tools/data_report.py` (updates `DATA_REPORT.md`).

## 4. Write down what changed
1. `python3 tools/diff_data.py` lists courses added/removed and every offer that went up or down.
2. Write a short plain-English summary of the changes (especially offers that went up or down, new 2028
   requirements, new or closed summer schools) for the person who asked for the refresh.

## 5. Redeploy
1. Bump `VERSION` in `sw.js` (e.g. `unibob-2027-03-01-1`) so phones and iPads pick up the new data.
2. `git add -A && git commit -m "Refresh data (<date>)" && git push`.
3. GitHub Pages redeploys in a minute or two. Open the live link and check it shows the new "last checked" date
   (Settings → About the data).
