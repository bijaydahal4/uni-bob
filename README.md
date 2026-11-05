# Uni Bob

A small, private web app for exploring UK universities for Economics and similar courses. It shows the entry
requirements for each course, a simple Safe-to-Reach slider based on your grades, ways to lower your offer,
summer schools, contextual offers and a timeline to starting uni in September 2028.

- Works in Safari on iPad and iPhone (add it to the Home Screen and it opens like an app, even offline) and on a Mac.
- Everything you type stays on your device. No accounts, no tracking.
- All uni information comes from official university and UCAS pages, with the source and the date it was checked.
  See [DATA_REPORT.md](DATA_REPORT.md) for what's covered and what couldn't be confirmed.

## Run it on your Mac
```bash
python3 tools/serve.py
```
Then open http://localhost:8000/ in Safari. (Python 3 comes with macOS's developer tools.)

## Refresh the data
Follow [REFRESH.md](REFRESH.md). In short: re-check every official source, switch to 2028-entry requirements as unis
publish them, update summer schools and timeline dates, rebuild with `python3 tools/merge_research.py`, run the
checks, then redeploy. A Claude Code session can do this for you: ask it to follow `REFRESH.md`.

## Redeploy
The site is published by GitHub Pages from the `main` branch. Bump `VERSION` in `sw.js`, then:
```bash
git add -A && git commit -m "Update Uni Bob" && git push
```
GitHub rebuilds the site in a minute or two.

## For developers
Plain HTML, CSS and JavaScript modules, no build step. See [CLAUDE.md](CLAUDE.md) for the rules, file layout and
commands (tests run in WebKit via Playwright for Python).

## Demo video
A 100-second walkthrough recorded from the real app (`video/uni-bob-demo.mp4`, not committed). To re-make it after
changes: `python3 tools/video/voice.py` (narration from `tools/video/script.json`, using a British voice on this
Mac), `.venv/bin/python tools/video/record.py` (drives the app frame by frame), then `python3 tools/video/build.py`
(captions, music and the final 1080p MP4 + `.srt`).
