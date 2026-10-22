# Research efficiency: audit, changes and measured results

October 2026. Measured with `tools/research_audit.py` (pages fetched vs cited), `tools/agent_cost.py` (each
research agent's transcript: tool calls, model turns and tokens) and the usage the agent harness reported.

## 1. What was causing the excessive research

**"84 sources" was really 84 evidence quotes.** Sheffield's file has 84 verbatim quotes, one per recorded fact.
Across the first 14 researched unis the averages were:

| per uni | average |
|---|---|
| courses recorded | 7.3 |
| evidence quotes (one per fact) | 57.4 |
| distinct official pages actually cited | 23.3 |
| saved page files | 74.7 |
| distinct pages fetched | 31.5 |
| duplicate copies of the same page | 43.2 |
| pages fetched but never cited | 13.4 |

Another 942 page files belonged to unis and programmes whose agents were cut off by usage limits and restarted
(for example 101 copies of Sutton Trust pages, 104 of Bristol's).

The causes, in order of cost:

1. **Many small agent steps.** Usage is dominated by *context re-reading*: every model turn re-sends everything
   the agent has read so far. Re-reads were 3–13 million tokens per uni against 0.2–0.5 million of new content. The
   most common step in every run was slicing a cached page a few lines at a time with `sed`/`grep`; other steps read
   the app's own code and other unis' files to work out how to fill ambiguous fields.
2. **Re-downloading.** Each tool kept its own page copies (`page_text --save`, `digest.py`, the evidence checker's
   cache). The evidence checker re-downloaded every cited page, and restarted agents fetched everything again.
3. **Shared facts rediscovered per uni**, e.g. whether a course uses the TMUA.
4. **Verification by agents.** The planned check would have re-opened every course's source a third time through
   subagents.
5. **A fetch bug.** Some servers sent compressed pages that weren't decoded, so agents retried in a browser.

## 2. What changed

- **Shared page cache** (`tools/pagecache.py`): one copy per normalised URL (no fragments or tracking parameters,
  `www.` ignored), reused for 7 days, used by every research tool. Existing saved pages were imported (1,156 files →
  832 distinct pages) so nothing was downloaded again. Compressed pages are decoded; unreadable copies are rejected.
- **Shared official facts** (`tools/shared_facts.py` → `research/shared.json`): UAT-UK's official 2027-entry course
  list answers "does this course use the TMUA?" for every uni at once (only Durham, Imperial, LSE, Warwick and UCL
  use it, plus Oxford and Cambridge). PDFs are now readable.
- **Research ledger and work packets** (`tools/research_status.py`): status, gaps and expiry for every uni (offers 120
  days; fees and contextual rules 180; living costs a year; open days 30 days or once passed; programme deadlines),
  and a short packet per uni listing what's done, what to fill, shared facts, and the cached official pages by topic.
- **Automated verification** (`tools/auto_verify.py`): re-opens each course's source and checks the quote is on the
  page, the offer, range or tariff and each required subject grade appear in it, the admissions test matches the
  page and UAT-UK's list, and the entry year is mentioned. Only failures go to an agent.
- **Fewer agent steps:** `digest.py` returns whole A-level blocks (without IB/BTEC/Scottish lines);
  `pagecache.py show URL [lines] [--grep]` reads part of any cached page; `set_fact.py` fills or flags one field
  with its quote in a single command; `research/EXAMPLE.json` shows a finished record; the guide (§0 of
  `research/INSTRUCTIONS.md`) adds clear stopping rules, a call budget and "don't read code or other files".
- **Coordinates** are looked up from the postcode during the merge, not by each agent.

## 3. Measured results

Single-uni research agents, all on the same model (Sonnet). "Re-read" is the cumulative context re-sent across
turns (the main usage driver); "new" is new content; tokens are from each transcript.

| run | situation | tool calls | turns | re-read | new | minutes | pages downloaded |
|---|---|---|---|---|---|---|---|
| v2 Loughborough | from scratch | 91 | 89 | 13.25M | 0.25M | 12.0 | — |
| v3 Cardiff | reused saved pages | 40 | 26 | 3.07M | 0.20M | 9.4 | — |
| v3 KCL | reused saved pages | 26 | 26 | 4.17M | 0.29M | 10.5 | — |
| v3 Sheffield | reused saved pages | 30 | 25 | 3.48M | 0.25M | 10.7 | — |
| v4 Surrey | from scratch | 47 | 39 | 5.17M | 0.42M | 13.6 | 21 |
| v4 Lancaster | from scratch | 41 | 36 | 4.83M | 0.49M | 22.4 | 22 |
| v4 Bristol | cached pages | 33 | 30 | 4.53M | 0.50M | 20.5 | 1 |
| v4 Manchester | cached pages | 64 | 57 | 9.31M | 0.28M | 18.0 | 1 |
| **v5 Reading** | from scratch | **18** | **16** | **1.93M** | 0.21M | 12.7 | 33 |
| **v5 Leicester** | from scratch | **32** | **30** | **3.36M** | 0.18M | 16.1 | 66 |
| v4 Sheffield gap-fill | 1 field | 35 | 26 | 2.39M | 0.13M | 3.8 | 2 |
| **v5 QMUL re-check** | 1 programme | **13** | **10** | **0.61M** | 0.04M | 1.8 | 1 |

From scratch, v5 against v4 (two unis each): context re-read down 47% (5.0M → 2.65M), tool calls down 43% (44 →
25), turns down 39%, new context down 56%, wall time down 20%. Against the first single-uni run (v2) re-reads are
80% lower. A one-item refresh fell from 35 calls and 2.39M re-read tokens to 13 calls and 0.61M (different gaps,
so indicative). The harness's own per-agent token figure (roughly the unique content an agent processes) moved
less: 266k → 233k per uni from scratch. Pages have to be read once, so that floor remains.

**Downloads:** agents with a cached uni downloaded 1 new page each instead of re-fetching 33–50. Evidence
checking and verification now download nothing for pages fetched in the last 7 days; before, they downloaded
every cited page again.

**Verification:** automated checks cover all 148 courses in seconds with no AI usage: 139 verified, 9 verified with
weaker matches, 0 needing review. Before, every course would have needed an agent to re-open its source.

## 4. Accuracy and coverage checks

- Every v4 and v5 run: 100% of evidence quotes found on the official pages (45/45, 65/65, 95/95, 65/65, 54/54,
  63/63, 64/64) and every course auto-verified (one "weak").
- TMUA statuses cross-checked against UAT-UK's official list: no conflicts.
- Courses per uni stayed at 7–8, and programmes per uni at 1–8 (before: 1–5). Reading recorded only one programme
  (Reading Scholars), so its outreach coverage is worth a spot check. Conflicting or missing details are
  still flagged, never guessed (e.g. Surrey's In2Surrey deadline appears as two different dates on its page).
- The verifier found a real defect: an unreadable cached page (undecoded gzip), now fixed at source.
- App checks after the new data: validator 0 errors, logic tests 54/54, end-to-end checks 23/23.

## 5. Trade-offs and remaining inefficiencies

- **Automated verification vs a person reading the page:** the script confirms the recorded values appear in
  verbatim text on today's official page. It can't fully judge context, e.g. a quote taken from the wrong course
  on a page that lists several. Courses with only weak matches are flagged so an agent can review them; for the
  highest confidence, review all "weak" items plus a random 10% sample.
- **Course-page discovery on hard websites** is still the costliest step (Leicester: 14 of 32 calls and 66
  downloads). The guide now says to use one targeted web search; that change hasn't been measured yet.
- The research guide (~26k characters) is re-read on every turn; a shorter checklist would save a little more.
- Builder scripts still repeat uni-wide wording (e.g. the same contextual-offer text) across courses.
- Samples are small (two unis per condition) and websites differ, so treat percentages as indicative.
- The earliest batch runs (v1) reported no usage, so they can't be compared directly.
