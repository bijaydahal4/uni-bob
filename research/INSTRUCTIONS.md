# Uni Bob research instructions (read all of this before you start)

You are researching UK universities for **Uni Bob**, a web app that helps a Year 12 student explore
Economics and related degrees. Accuracy matters more than anything: she will make real decisions with this.

**Who uses it:** Year 12 students applying through UCAS in autumn 2027 for **September 2028** entry. The app's
default profile takes A-level Maths, Geography and Psychology, and distances are measured from Bournemouth.
Never write personal details about any student in any file.

Today's date: run `date +%F` and use that as the "checked" date for everything you check.

---

## 0. How to research efficiently (read this first)

**Start from your work packet:** `research/packets/<uni-id>.md` (made by
`python3 tools/research_status.py --packets`). It says what's already done (keep it), the exact gaps to fill,
facts that shared official sources already answer (e.g. UAT-UK's TMUA list), and the official pages already
in the cache, grouped by topic with a ready-made `digest.py` command for each group.

**Principles**
1. **One authoritative page answers many questions.** A course page usually gives the offer, required subjects,
   GCSEs, excluded subjects, EPQ/contextual offers, length and options together. Read it once and take everything.
2. **Group questions by page:** fees (one fees page), living costs (one accommodation/cost page), open days (one
   page), contextual admissions and outreach/summer schools (one or two pages).
3. **Never download a page twice.** `page_text.py` and `digest.py` read the shared cache (`tools/pagecache.py`);
   a page fetched in the last 7 days costs nothing to re-read. Don't save extra copies of pages.
4. **Search only for what navigation can't reach.** Use the uni's own course list or economics page once with
   `--links | grep -i -E "econom|financ|account|business|manag|politic|ppe|real estate"`, then open only the
   relevant results. Don't open every search result.
5. **Stop when a fact is clear.** One official page that states the fact (quoted verbatim) is enough. Look further
   only if: the page is unclear or contradicts itself; two official pages disagree; the page is missing, blocked
   or out of date (then try the UCAS course page); or a critical eligibility rule is ambiguous.
6. **Never guess and never silently omit.** If a critical detail can't be established, set it to `null` and add
   it to `notConfirmed`.
7. **Don't re-research shared facts** listed in the packet (TMUA status from the UAT-UK list; national
   programmes like the Sutton Trust or Realising Opportunities). Only record this uni's own alternative offer for
   a national programme if this uni's page states one. Never assume one uni's rules apply to another.
8. **Postcode only:** record the campus postcode and the official page showing it; `merge_research.py` adds the
   coordinates automatically.

**Everything you need is in this file, your packet and `research/EXAMPLE.json`** (a real finished record showing
how every field is filled). Don't read the app's code, the tools' code or other unis' files — every extra read is
paid for again on every later step, because each step re-sends everything read so far.

**Read in as few commands as possible.** Each command you run costs about as much as re-reading everything so far,
so one big read beats five small ones.
- All course pages in ONE call: `python3 tools/digest.py <uni-id> --topic courses URL1 URL2 …` (prints the whole
  A-level blocks, without IB/BTEC/Scottish lines). Then all fees/accommodation/open-day/contextual/outreach pages
  in ONE more call with `--topic uni`.
- If you still need a specific part of a cached page, get every bit you need in one command, e.g.
  `python3 tools/pagecache.py show URL 120-180; python3 tools/pagecache.py show URL2 --grep "EPQ|contextual"`.
  Don't write your own page readers.

**Workflow and budget** — from scratch about 8–12 tool calls; filling one or two gaps 2–4 tool calls.
1. Read your packet, this file and `research/EXAMPLE.json` (one call each, or one `cat`).
2. Discovery, if course URLs aren't in the packet: ONE web search per course family is usually enough, e.g.
   `site:le.ac.uk economics undergraduate 2027` (load WebSearch with ToolSearch `select:WebSearch` if needed) — it
   returns the exact course pages. Only if that fails, one `page_text.py <economics or course-list page> --links |
   grep -i -E "econom|financ|account|business|manag|politic|ppe"` call. Don't click through listing pages one by one.
3. Read: one `digest.py --topic courses` call, one `digest.py --topic uni` call (step 2 above).
4. Write the whole builder script in one go (`research/tmp/build/<uni-id>.py`), then run it with the checks in the
   same call: `python3 research/tmp/build/<uni-id>.py && python3 tools/check_evidence.py research/unis/<uni-id>.json && python3 tools/auto_verify.py <uni-id>`
5. Fix any MISSING quote or REVIEW item, then stop.

**Filling a gap** (the packet names the field and the cached page to read):
1. `python3 tools/pagecache.py show <URL> --grep "<what you need>"` (or `digest.py` for several pages, one call).
2. `python3 tools/set_fact.py <uni-id> '<path>' '<json value>' --url <URL> --evidence "<verbatim quote>"` — or, if the
   page doesn't say, `--not-confirmed "<why>"`. It checks the quote for you. Then stop.

**Field notes** (answers to the questions researchers usually look up in code):
- `alternativeOffers[].offer`: the grades only (e.g. `"AAB"`). If the page says "up to two grades lower" without
  grades, set `offer: null` and put the wording in `conditions`.
- `academicYear`: write it as the page does, e.g. `"2027/28"`.
- `contextual.criteria[].alone` / `minCriteria`: only from the uni's own wording ("you need to meet two of…" →
  `minCriteria: 2`, `alone: false`); otherwise `null`.
- `programmes[].infoYear`: the year of the programme the details describe (e.g. 2026 if only last year's dates
  are published); `eligibility`: `open`, `criteria`, or `null` if the page doesn't say (then add a `notConfirmed` line).

**Expiry (when facts must be re-checked):** course offers, subjects and tests after 120 days (and from February
2027, check whether 2028-entry requirements are out); fees and contextual criteria after 180 days; living costs
after a year; open days after 30 days or once the listed dates pass; programme dates after 30 days, every 14
days when a deadline is within 60 days, and straight away once a deadline passes (look for the next round).
`tools/research_status.py` applies these rules and lists what's due.

## 1. The rules (non-negotiable)

1. **Official sources only.** Every fact must come from the university's (or programme's) own official
   website. The UCAS course page (`digital.ucas.com` / `ucas.com`) is fine as a second source.
   **Never** use forums, The Student Room, blogs, news sites, league-table sites, AI summaries or your own
   memory. If you "know" something but haven't seen it on an official page today, it doesn't count.
2. For every fact record the **source URL**, the **date you checked it** and (for course facts) the
   **entry year** it applies to.
3. **Use the newest entry year published.** For each course, check whether the uni has published
   **2028 entry** requirements (look for "2028" in course URLs, year pickers or page headings). If yes, use
   2028. Otherwise use **2027 entry**. Record `entryYear` on every course. Never mix years within a course.
4. **Never guess.** If you can't confirm something, set it to `null` and add a short line to
   `notConfirmed` explaining what's missing (e.g. `"gcse: course page doesn't list GCSE requirements"`).
5. Every date is either `"Confirmed"` (published on an official page for that specific year) or
   `"Expected"` (an estimate based on previous years — then say what it's based on).
6. Evidence: for every offer, subject requirement, admissions test, alternative/contextual offer, fee and
   programme deadline, copy a **short verbatim quote** (max ~200 characters) from the page text into an
   `evidence` field. This is what the verification pass will check. Copy it exactly from the page text
   tool output — do not paraphrase inside `evidence`.

## 2. How to read pages

- **Primary:** `python3 tools/page_text.py URL` (plain fetch, fast). Use `--find "REGEX"` to see only
  matching lines with context, e.g. `--find "A\*|AAA|AAB|A level|TMUA|GCSE|contextual"`.
  Use `--links` to list the page's links (handy for finding course pages). Use `--save research/tmp/x.txt`
  to keep a copy.
- **If the page needs JavaScript or the plain fetch fails:** `.venv/bin/python tools/page_text.py --browser URL`
  (real headless browser; includes hidden accordion/tab content).
- **If the uni page still won't load:** try the course's UCAS page with `--browser`
  (e.g. search `site:digital.ucas.com <uni> economics`).
- **WebSearch** is fine for *finding* official URLs. **WebFetch** may only be used to locate pages, never
  as the source of a fact (it returns an AI summary). Every recorded fact must be visible in
  `page_text.py` output from the official page, with its `evidence` quote copied from that output.
  (If WebSearch/WebFetch aren't loaded, load them via ToolSearch: `select:WebSearch,WebFetch`.)
- Don't use any browser-pane, Chrome or computer-use tools (they'd take over the user's screen).
- Work from the project root `/Users/bijaydahal/uni-bob`. Only write inside `research/`.
  Scratch files go in `research/tmp/` (create it if needed).

## 3. What to research for each university

Save **one JSON file per university** to `research/unis/<uni-id>.json` **as soon as that uni is done**
(and re-save as you add courses, so nothing is lost if you're cut off). Check it parses:
`python3 -m json.tool research/unis/<uni-id>.json > /dev/null && echo ok`.

### Courses: about 6 per uni, 8 at most
Always include the uni's **main Economics degree(s)**, then the best matches from this list:
- Economics; Economics and Finance; Economics and Accounting
- Business Economics; Economics and Management
- Economics and Politics; PPE
- Economics with Geography, Development or Environment
- Behavioural Economics, or Economics and Psychology
- Mathematics and Economics; Econometrics (record if Further Maths is needed or preferred)
- Finance; Accounting and Finance; Business and Management; Real Estate

Prefer the standard 3-year version (Scotland: 4-year). If the "with placement year", "with year abroad"
or "with foundation year" version has its own UCAS code, record the standard course and note the option
under `options` instead of adding a separate course. If a uni offers fewer relevant courses, that's fine.
If a uni offers **none** of the courses above, save a file with `"courses": []` and explain in `notes`.

### Uni file schema (placeholders in <angle brackets>; use null when unknown)

```json
{
  "id": "<uni-id from your brief>",
  "name": "<official name, e.g. University of Somewhere>",
  "shortName": "<what people call it, e.g. Somewhere>",
  "aliases": ["<common short names, initials and nicknames people type, e.g. UoS, Somewhere Uni>"],
  "city": "<town/city of the main campus for these courses>",
  "region": "<one of: London | South East | South West | East of England | Midlands | North | Wales | Scotland | Northern Ireland>",
  "country": "<England | Wales | Scotland | Northern Ireland>",
  "setting": "<campus | city | mixed>",
  "settingEvidence": {"url": "<official page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote, e.g. 'our single-site campus'>"},
  "location": {
    "postcode": "<official postcode of the main campus where these courses are taught>",
    "postcodeSource": "<official uni page showing that address>",
    "lat": 0.0, "lng": 0.0,
    "coordsSource": "https://api.postcodes.io/postcodes/<POSTCODE-NO-SPACE>",
    "checked": "<YYYY-MM-DD>"
  },
  "fees": {
    "homeAnnual": 0,
    "academicYear": "<e.g. 2027/28 or 2026/27 — whatever the page states>",
    "text": "<plain summary, e.g. '£X per year for UK students (2027/28)'>",
    "source": {"url": "<official fees page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote>"}
  },
  "livingCosts": {
    "kind": "<living cost estimate | halls rent>",
    "amountLow": 0, "amountHigh": 0,
    "period": "<year | week | month>",
    "academicYear": "<e.g. 2026/27>",
    "text": "<plain summary, e.g. 'Halls cost about £X–£Y a week (2026/27)'>",
    "source": {"url": "<official page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote>"}
  },
  "openDays": {
    "events": [
      {"date": "<YYYY-MM-DD>", "endDate": null, "label": "<e.g. Undergraduate open day>", "format": "<in person | online>", "status": "Confirmed"}
    ],
    "text": "<e.g. 'Next open days: 24 October 2026' or '2027 dates not announced yet'>",
    "url": "<official open days page>",
    "source": {"url": "<official page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote>"}
  },
  "contextual": {
    "offersContextual": true,
    "summary": "<one plain sentence about their contextual admissions>",
    "typicalReduction": "<as officially stated, e.g. 'usually two grades below the typical offer'>",
    "criteria": [
      {"key": "<see list below>", "detail": "<plain words from their page>", "measure": "<for area criteria: POLAR4 | TUNDRA | IMD | ACORN | ABCS | other>", "quintiles": [1, 2], "threshold": null, "alone": null}
    ],
    "minCriteria": null,
    "rulesText": "<how they combine criteria, quoted or closely paraphrased>",
    "url": "<official contextual admissions page>",
    "source": {"url": "<official page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote>"}
  },
  "programmes": [ "<summer schools / access programmes / Year 12 tasters this uni runs — see section 4>" ],
  "links": {
    "home": "<uni homepage>",
    "courses": "<undergraduate course search/list page>",
    "economics": "<economics department or subject page>",
    "openDays": "<url>", "fees": "<url>", "contextual": "<url>", "accommodation": "<url>"
  },
  "courses": [ "<course objects — see below>" ],
  "notes": ["<anything notable, e.g. 'Economics requires the TMUA from 2027 entry'>"],
  "notConfirmed": ["<what you couldn't confirm and why>"]
}
```

**Contextual criteria keys** (use exactly these):
`area` (lives in an area where fewer young people go to uni — record `measure` and `quintiles`),
`fsm` (free school meals), `school` (school/college results below average or school context),
`firstGen` (first in family to go to uni / parents without a degree), `care` (care experienced),
`carer` (young carer), `estranged` (estranged from parents), `refugee` (refugee or asylum seeker),
`income` (household income below a threshold — put the amount in `threshold`),
`access` (took part in one of their access/outreach programmes — name them in `detail`),
`other` (anything else, described in `detail`).
`alone`: `true` only if the uni says meeting this one criterion is enough on its own; `false` if they say
you need a combination; `null` if they don't say. `minCriteria`: the number of criteria they say you must
meet, or `null`. **Never invent criteria.** If they don't publish criteria, say so in `notConfirmed`.

### Course schema

```json
{
  "id": "<uni-id>-<short-slug, e.g. economics, economics-finance>",
  "name": "<official course name, e.g. Economics and Finance>",
  "degree": "<BSc | BA | MA | BSc (Hons) etc. as published>",
  "ucasCode": "<e.g. L100>",
  "lengthYears": 3,
  "lengthNote": "<e.g. '4 years with a placement year' or null>",
  "options": {
    "yearAbroad": "<optional | required | none | unknown>",
    "placement": "<optional | required | none | unknown>",
    "foundationYear": "<available | none | unknown>"
  },
  "types": ["<one or more from the list below>"],
  "entryYear": 2027,
  "offer": {
    "kind": "<grades | tariff>",
    "typical": "<grades, highest first, e.g. AAA or A*AA; for a range put the TOP of the range here>",
    "low": "<bottom of a published range, e.g. AAB for 'AAA-AAB'; else null>",
    "tariff": null,
    "tariffLow": null,
    "text": "<close paraphrase of the official wording, e.g. 'A*AA including A* in Mathematics'>",
    "source": {"url": "<official course page>", "checked": "<YYYY-MM-DD>", "evidence": "<verbatim quote>"}
  },
  "subjectRequirements": [
    {"subjects": ["Mathematics"], "minGrade": "<A* | A | B | C | D | E or null if just 'must take'>", "note": "<e.g. 'A-level Maths at grade A'>"}
  ],
  "preferredSubjects": [{"subjects": ["<e.g. Further Mathematics>"], "note": "<e.g. 'preferred but not required'>"}],
  "furtherMaths": "<required | preferred | notRequired | notMentioned>",
  "gcse": [{"subject": "<Mathematics | English Language | English>", "minGrade": "<9-1 grade as a string, e.g. '6'>", "note": "<extra detail or null>"}],
  "gcseText": "<official GCSE wording, or null>",
  "notAccepted": ["<subjects they say they don't accept, e.g. General Studies>"],
  "acceptsPsychology": "<yes | no | unknown>",
  "acceptsGeography": "<yes | no | unknown>",
  "subjectsEvidence": {"url": "<page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote about required/excluded subjects>"},
  "admissionsTest": {
    "status": "<required | optional | none>",
    "name": "<e.g. TMUA, or null>",
    "effect": "<plain English, e.g. 'A good TMUA score can earn you a lower offer of AAB'>",
    "source": {"url": "<page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote>"}
  },
  "alternativeOffers": [
    {
      "type": "<epq | contextual | accessProgramme | summerSchool | tmua | other>",
      "offer": "<grades, e.g. AAB, or null>",
      "tariff": null,
      "conditions": "<plain words, e.g. 'plus grade A in the EPQ' or 'if you meet their contextual criteria'>",
      "programme": "<programme name if it's tied to one, else null>",
      "source": {"url": "<page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote>"}
    }
  ],
  "competition": null,
  "links": {"course": "<official course page>", "ucas": "<UCAS course page if you found it, else null>"},
  "notConfirmed": [],
  "notes": "<optional, e.g. 'Further Maths preferred' or null>"
}
```

- `competition`: only if the uni **officially publishes** it for this course, e.g.
  `{"offerRate": 0.21, "applicationsPerPlace": null, "year": "2025 entry", "text": "...", "source": {...}}`.
  Never estimate or calculate it yourself. Otherwise `null`.
- `subjectRequirements`: one entry per requirement; `subjects` lists the alternatives that satisfy it
  (e.g. `["Mathematics", "Further Mathematics"]` = "Maths or Further Maths"). If the offer says
  "A*AA including A* in Maths", record `{"subjects": ["Mathematics"], "minGrade": "A*"}`.
- `acceptsPsychology` / `acceptsGeography`: `yes` if the page says all A-levels are accepted, lists them as
  accepted, or lists excluded subjects and they're not on it; `no` if excluded; `unknown` if nothing is said.
- `alternativeOffers`: only offers the uni officially publishes (EPQ offers, contextual offers, access or
  summer-school offers, TMUA-based offers, etc.). Contextual offers that are course-specific go here too.
- If the offer is in UCAS tariff points: `"kind": "tariff"`, `"tariff": <top of range>`, `"tariffLow": <bottom>`,
  and put any grade equivalent they publish in `typical`/`low` (else null).
- Scottish unis: record the A-level offer for students from the rest of the UK; if they publish a
  "standard" and a "minimum" (widening access) offer, `typical` = standard, and the minimum goes in
  `alternativeOffers` as `contextual` with its conditions.

**Course types** (use one or more, exactly as written):
`economics`, `economics-finance`, `economics-accounting`, `business-economics`, `economics-management`,
`economics-politics`, `ppe`, `economics-geography` (Economics with Geography, Development or Environment),
`behavioural-economics` (Behavioural Economics, Economics and Psychology), `maths-economics`
(Maths and Economics, Econometrics, Mathematical Economics, Economics and Data Science/Statistics),
`finance`, `accounting-finance`, `business-management`, `real-estate`.

## 4. Summer schools, access programmes and Year 12 tasters

In each uni's `programmes` array, record that uni's own programmes that are **relevant to Economics or
related courses** (business, finance, social sciences, general academic) **or that can lower offers** there
(e.g. "Access to X", "X Scholars", "Pathways to X", residential summer schools, Year 12 Economics taster days,
paid pre-university summer schools). Skip events only for other subjects (e.g. medicine) or for younger years.
National charity programmes (Sutton Trust, Realising Opportunities, Social Mobility Foundation, etc.) are
handled by a separate researcher — only mention them in a uni's `notes` if that uni gives an alternative offer
for them (and record that in the course's `alternativeOffers`).

```json
{
  "id": "<uni-id>-<short-slug>",
  "name": "<official programme name>",
  "provider": "<e.g. University of Somewhere>",
  "providerType": "university",
  "uniIds": ["<uni-id>"],
  "summary": "<one plain sentence on what it is>",
  "whoCanApply": "<plain words, e.g. 'Year 12 students at state schools who meet two of these criteria…'>",
  "eligibility": "<open | criteria>",
  "eligibilityCriteria": ["<contextual keys from section 3 that apply, e.g. area, fsm, firstGen>"],
  "eligibilityDetail": "<details as published>",
  "benefits": ["<e.g. 'Lower offer at Somewhere (up to two grades)', 'Bursary of £X if you enrol'>"],
  "lowersOffer": true,
  "lowersOfferAt": ["<uni-ids where it officially lowers offers>"],
  "offerReduction": "<as officially stated, or null>",
  "cost": "<'Free' or the price>",
  "isFree": true,
  "format": "<online | day | residential | mixed>",
  "subjects": "<e.g. 'Economics', 'Social sciences', 'All subjects'>",
  "yearGroup": "<e.g. Year 12>",
  "runs": {"text": "<e.g. 'July 2027'>", "start": "<YYYY-MM-DD or null>", "end": "<YYYY-MM-DD or null>", "status": "<Confirmed | Expected>"},
  "opens": {"text": "<e.g. 'January 2027'>", "date": "<YYYY-MM-DD or null>", "status": "<Confirmed | Expected>"},
  "deadline": {"text": "<e.g. '15 March 2027'>", "date": "<YYYY-MM-DD or null>", "status": "<Confirmed | Expected>"},
  "infoYear": 2027,
  "infoNote": "<e.g. 'Based on the 2026 programme. 2027 dates not announced yet.' or null>",
  "url": "<official programme page>",
  "source": {"url": "<page>", "checked": "<YYYY-MM-DD>", "evidence": "<quote>"},
  "notConfirmed": []
}
```

She'd attend in **summer 2027** (Year 12). `infoYear` = the year of the programme the details describe.
If 2027 details aren't out yet, record the latest published details (e.g. 2026), set `infoYear: 2026`, mark
2027 dates `Expected` only if you can base them on the 2026 dates (say so in `infoNote`), otherwise null.

## 5. Postcode and region

Record the official postcode of the main campus where these courses are taught (contact/find-us page) in
`location.postcode`, with that page in `location.postcodeSource`. Leave `lat`/`lng` empty: `merge_research.py`
looks the postcode up on postcodes.io once and caches it. Region must be one of the listed values (Midlands covers East and
West Midlands; North covers North East, North West and Yorkshire and the Humber).

## 6. When you finish

- Make sure every uni in your brief has a valid JSON file in `research/unis/`.
- Reply with a **short** summary (under 150 words): unis done, number of courses each, and the main things
  you couldn't confirm. Don't paste the data into your reply.

## 7. Verification pass (for verifiers, not researchers)

You check facts someone else recorded. For each uni you're given:
1. Read `research/verify/<uni-id>-todo.md` (made by `python3 tools/verify_prep.py`). It lists every course's
   claimed offer, required subjects and admissions test, with the source URL, and ends with one `digest.py`
   command that re-opens all the sources at once — run it (pages are re-fetched today; delete stale copies in
   `research/tmp/<uni-id>/` first only if a page looks out of date).
2. For each course, compare the claim with the page: entry year, typical offer and range, required subjects and
   grades, admissions test. Write `research/verify/<uni-id>.json`:
   `{"uni": "<id>", "checked": "<YYYY-MM-DD>", "courses": [{"id": "...", "offer": "ok|wrong|unclear",
   "subjects": "ok|wrong|unclear", "test": "ok|wrong|unclear", "note": "what the page actually says if wrong",
   "evidence": "verbatim quote", "url": "..."}]}`
3. If something is wrong, fix it in `research/unis/<uni-id>.json` (with a new verbatim evidence quote and today's
   date) and say so in `note`. Never change anything you can't see on the page.
4. Keep it lean: about 6–10 tool calls per uni. Reply with one line per uni: "<id>: N ok, M fixed, K unclear".
