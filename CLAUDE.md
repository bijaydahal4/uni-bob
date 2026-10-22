# Uni Bob — notes for Claude

Uni Bob is a small web app that helps a Year 12 student explore UK universities for Economics and related
courses, see her chances, and plan her application (UCAS in autumn 2027, starting September 2028). It is hosted
on GitHub Pages. Read this before changing anything.

## Privacy (non-negotiable)
- Never put a student's name, school or GCSE grades in code, data, commit messages or the repo. The app asks for
  her details on first launch and keeps them in her browser only (`localStorage`, key `unibob:v1`).
- No accounts, no server, no analytics, no tracking, no third-party requests at runtime (no CDNs, no web fonts).
- `<meta name="robots" content="noindex">` stays on.
- `PROGRESS.md`, `research/tmp/` and raw page text are local only (see `.gitignore`).

## Data rules (accuracy matters more than anything)
1. Official sources only: the university's or programme's own website; the UCAS course page as a second source;
   league tables only for rankings. Never forums, The Student Room, blogs, AI summaries or memory.
2. Every fact records its source URL, the date checked and (for course facts) the entry year.
3. Use the newest entry year published (2028 as soon as a uni publishes it, otherwise 2027, labelled).
4. Never guess. Unknown → `null` plus a line in `notConfirmed`; the app shows "Not confirmed: check the uni's page".
5. Every date is `Confirmed` (with a source) or `Expected` (with `basedOn`). Never show an estimate as a fact.
6. Evidence quotes are copied verbatim from the page text; `tools/check_evidence.py` must find each one.
7. After research: merge, then verify. `tools/auto_verify.py --fresh` re-opens every course's source and checks the
   quote, offer, subject grades, test (against UAT-UK's list) and entry year; only courses it can't confirm go to
   fresh subagents for a manual check (§7 of `research/INSTRUCTIONS.md`). Then `tools/validate_data.py`.
8. League table: Complete University Guide 2027 (overall + Economics), used consistently.

## Design rules
- Apple-like and minimalist: grouped lists, white space, system font, gentle motion; iPad Settings-style sidebar
  (collapses behind a button in portrait and on small screens).
- Mainly black and white with navy `#1B2A4A` and pink `#F2A7C1`; dark mode uses pink / lighter navy accents.
  All text and controls pass WCAG AA. Never rely on colour alone (chances always have text labels).
- Touch: 44×44 pt targets, no hover-only UI, inputs ≥ 16px, safe-area padding, `dvh`, no sideways scrolling,
  respect Reduce Motion, VoiceOver labels.
- Plain, friendly words for a 16-year-old. Every bit of jargon gets an ⓘ (`data/glossary.json`).
  Encouraging tone: "Reach" / "Long shot", never "You won't get in".

## Chance logic (`js/logic/grades.js`, tested in `tests/grades.test.js`)
A* 6, A 5, B 4, C 3, D 2, E 1, U 0; best three A-levels, always including a required subject. Gap = hers − offer:
+2 Safe, +1 Good chance, 0 Match, −1 Reach, ≤−2 Long shot. Ranges use the top. Tariff: A* 56 … E 16, 8 points ≈
one grade (rounded down). Below a required subject grade → at best Reach; missing a required subject → Long
shot. Officially very competitive (≥10 applications per place or ≤20% offer rate) → one step towards Reach
(from Safe/Good/Match only). What-ifs unlock only officially published alternative offers.

## File layout
- `index.html`, `css/app.css`, `js/` (ES modules, no build step), `sw.js`, `manifest.webmanifest`, `icons/`
- `js/logic/` pure logic (grades, search, filters, contextual, dates, geo) · `js/ui/` components ·
  `js/screens/` one file per screen · `js/store.js` local state · `js/data.js` data loading
- `data/` app data (built by `tools/merge_research.py` — don't hand-edit; change research or `tools/content/`)
- `research/unis/*.json`, `research/programmes-national.json`, `research/timeline.json` structured research with
  evidence; `research/INSTRUCTIONS.md` the rules and schema for researchers
- `tools/content/` hand-written app text (glossary, timeline wording, A-level subject list)
- `tools/` scripts (Python 3, no Node needed); `tests/` logic tests run in WebKit

## Commands
- Serve locally: `python3 tools/serve.py` → http://localhost:8000/
- Setup for tests: `python3 -m venv .venv && .venv/bin/pip install playwright && .venv/bin/python -m playwright install webkit chromium`
- Logic tests (WebKit): `.venv/bin/python tools/run_tests.py`
- App checks (WebKit): `.venv/bin/python tools/e2e.py`
- Screenshots: `.venv/bin/python tools/screenshots.py` → `research/tmp/shots/`
- Build data: `python3 tools/merge_research.py` · validate: `python3 tools/validate_data.py`
- Evidence quotes: `python3 tools/check_evidence.py research/unis/*.json`
- Links and changed pages: `python3 tools/check_links.py [--update]`
- What changed since the last commit: `python3 tools/diff_data.py`
- Research workflow (see `research/INSTRUCTIONS.md` §0): `python3 tools/research_status.py --packets` (ledger, gaps,
  expiry, one work packet per uni) → agent reads its packet → `tools/digest.py <uni> URL…` (reads many pages in one
  call) → builder script → `tools/check_evidence.py` + `tools/auto_verify.py <uni>`
- Shared page cache: every tool reads pages through `tools/pagecache.py` (one copy per URL in `research/cache/`,
  reused for 7 days; `python3 tools/pagecache.py stats`). Never save extra page copies.
- Shared official facts (e.g. UAT-UK's TMUA course list): `python3 tools/shared_facts.py` → `research/shared.json`
- Efficiency audit: `python3 tools/research_audit.py` (pages fetched vs cited, duplicates, agent costs from
  `research/agent-runs.json`)
- Icons: `.venv/bin/python tools/make_icons.py`

## When you change code
- Keep relative paths (the site lives at `https://<user>.github.io/uni-bob/`).
- New JS/CSS/icon files must be added to `SHELL_FILES` in `sw.js`; bump `VERSION` in `sw.js` on every deploy.
- Run the logic tests, the app checks and the validator before pushing.
