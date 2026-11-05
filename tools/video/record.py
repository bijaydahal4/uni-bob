#!/usr/bin/env python3
"""Record the demo video's picture: drives the real Uni Bob app in a headless browser, one frame at a time.

Usage: .venv/bin/python tools/video/record.py
Needs video/voice/durations.json (from voice.py) so each scene lasts as long as its narration.
Writes video/frames/*.jpg plus video/timeline.json: for every frame, which image to show, where the cursor is,
any zoom, highlight or click ripple. tools/video/compose.swift turns that into the finished MP4.
The app itself is never modified: cursor, highlights, zooms and captions are all drawn afterwards.
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))
from serve import start  # noqa: E402
from screenshots import state  # noqa: E402
sys.path.insert(0, HERE)
import build  # noqa: E402
CAPTIONS = {sc["id"]: sc["caption"] for sc in json.load(open(os.path.join(HERE, "script.json")))["scenes"]}

FPS = 30
DPR = 1.5                      # 1280×720 CSS pixels → 1920×1080 frames, so text is large and sharp
W, H = 1280, 720
OUT = os.path.join(ROOT, "video")
FRAMES = os.path.join(OUT, "frames")
LEAD = 0.35                    # narration starts this long after its scene starts
TAIL = 0.55                    # quiet gap after each scene's narration


def ease(t):
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


class Director:
    def __init__(self, page):
        self.page = page
        self.frames, self.images = [], 0
        self.cursor = [1560.0, 830.0]
        self.zoom = [1.0, 960.0, 540.0]
        self.hl = None            # [x, y, w, h] in frame pixels
        self.hl_alpha = 0.0
        self.hl_target = 0.0
        self.click_at = None
        self.scenes, self.titles = [], []

    # -- frames ---------------------------------------------------------------------------------
    @property
    def t(self):
        return len(self.frames) / FPS

    def snap(self):
        self.images += 1
        self.page.screenshot(path=os.path.join(FRAMES, f"{self.images:05d}.jpg"), type="jpeg", quality=92)

    def frame(self, fresh=False):
        if fresh or not self.images:
            self.snap()
        a = self.hl_alpha + (self.hl_target - self.hl_alpha) * 0.25
        self.hl_alpha = a if abs(a - self.hl_target) > 0.01 else self.hl_target
        self.frames.append({
            "img": self.images, "cur": [round(self.cursor[0], 1), round(self.cursor[1], 1)],
            "zoom": [round(z, 4) for z in self.zoom],
            "hl": [*self.hl, round(self.hl_alpha, 3)] if self.hl and self.hl_alpha > 0 else None,
            "click": round(self.t - self.click_at, 3) if self.click_at is not None and self.t - self.click_at < 0.6 else None,
        })

    def wait(self, sec, fresh_for=0.0):
        n = max(1, round(sec * FPS))
        for i in range(n):
            self.frame(fresh=i < fresh_for * FPS)

    def hold_until(self, t):
        while self.t < t:
            self.frame()

    # -- the pretend user -----------------------------------------------------------------------
    def box(self, sel):
        loc = self.page.locator(sel).first
        loc.wait_for(state="visible", timeout=10000)
        b = loc.bounding_box()
        return [b["x"] * DPR, b["y"] * DPR, b["width"] * DPR, b["height"] * DPR]

    def move(self, target, sec=0.7, zoom=None):
        """Glide the cursor to a selector's centre (or an [x, y] in frame pixels), optionally easing the zoom."""
        if isinstance(target, str):
            x, y, w, h = self.box(target)
            target = [x + w / 2, y + h / 2]
        (sx, sy), z0 = self.cursor, list(self.zoom)
        n = max(1, round(sec * FPS))
        for i in range(1, n + 1):
            k = ease(i / n)
            self.cursor = [sx + (target[0] - sx) * k, sy + (target[1] - sy) * k]
            if zoom:
                self.zoom = [z0[j] + (zoom[j] - z0[j]) * k for j in range(3)]
            self.frame()

    def zoom_to(self, z, sec=1.2):
        z0 = list(self.zoom)
        n = max(1, round(sec * FPS))
        for i in range(1, n + 1):
            k = ease(i / n)
            self.zoom = [z0[j] + (z[j] - z0[j]) * k for j in range(3)]
            self.frame()

    def click(self, sel, sec=0.7, after=0.6):
        self.move(sel, sec)
        self.click_at = self.t
        self.page.mouse.click(self.cursor[0] / DPR, self.cursor[1] / DPR)
        self.wait(after, fresh_for=after)

    def type(self, text, per_char=0.09):
        for ch in text:
            self.page.keyboard.type(ch)
            self.wait(per_char, fresh_for=per_char)
        self.wait(0.3, fresh_for=0.3)

    def scroll_to(self, y_css, sec=1.2):
        y0 = self.page.evaluate("document.getElementById('detail').scrollTop")
        n = max(1, round(sec * FPS))
        for i in range(1, n + 1):
            self.page.evaluate(f"document.getElementById('detail').scrollTop = {y0 + (y_css - y0) * ease(i / n)}")
            self.frame(fresh=True)

    def scroll_into(self, sel, top=120, sec=1.2):
        y = self.page.locator(sel).first.evaluate("e => e.getBoundingClientRect().top + document.getElementById('detail').scrollTop")
        self.scroll_to(max(0, y - top), sec)

    def highlight(self, sel, pad=10):
        x, y, w, h = self.box(sel)
        self.hl, self.hl_target = [x - pad, y - pad, w + 2 * pad, h + 2 * pad], 1.0

    def unhighlight(self):
        self.hl_target = 0.0

    def goto(self, route):
        self.page.evaluate(f"location.hash = {json.dumps(route)}")
        self.page.wait_for_selector("#main .page")
        self.page.evaluate("document.getElementById('detail').scrollTop = 0")
        self.wait(0.4, fresh_for=0.4)

    def scene(self, sid, dur):
        start = self.t
        self.scenes.append({"id": sid, "start": round(start, 3), "voice": round(start + LEAD, 3), "dur": dur})
        return start + LEAD + dur + TAIL

    def cue(self, phrase):
        """When the current scene's narration reaches the caption line containing `phrase` (same timing as build.py)."""
        sc = self.scenes[-1]
        parts = build.chunks(CAPTIONS[sc["id"]])
        total = sum(build.weight(p) for p in parts)
        t = sc["voice"]
        for p in parts:
            if phrase in p:
                return t
            t += sc["dur"] * build.weight(p) / total
        raise ValueError(phrase)


def zoom_on(d, sel, scale=1.35):
    x, y, w, h = d.box(sel)
    return [scale, x + w / 2, y + h / 2]


def run(page, durs):
    d = Director(page)
    # 1. Introduction: the Explore screen, with the title card.
    end = d.scene("intro", durs["intro"])
    d.titles.append({"start": 0.6, "end": 5.4, "text": "Uni Bob", "sub": "Your university journey, organised."})
    d.wait(1.0)
    d.zoom_to([1.06, 1180, 520], 4.0)
    d.move("#main input[type=search]", 1.4)
    d.zoom_to([1.0, 960, 540], 1.5)
    d.hold_until(end)

    # 2. Explore: search, quick filters, then a uni's courses with their offers and chances.
    end = d.scene("explore", durs["explore"])
    d.click("#main input[type=search]", 0.5, after=0.2)
    d.type("economics")
    d.wait(0.9)
    d.click('[data-action="clear-q"]', 0.6, after=0.4)
    d.hold_until(d.cue("Search and filter") - 1.0)
    d.click('[data-quick="rg"]', 0.6, after=0.4)
    d.highlight("text=/courses at/")
    d.click('[data-quick="match"]', 0.6, after=0.6)
    d.unhighlight()
    d.hold_until(d.cue("then compare") - 1.9)
    d.click("#main input[type=search]", 0.6, after=0.2)
    d.type("bath", 0.08)
    d.click('[role=option]:has-text("University of Bath")', 0.6, after=0.6)
    d.zoom_to([1.18, 1140, 640], 1.6)
    d.hold_until(end - 0.6)
    d.zoom_to([1.0, 960, 540], 0.6)

    # 3. A course page: Bath Economics, then save it to the shortlist.
    end = d.scene("course", durs["course"])
    d.click('a[href="#/course/bath-economics"]', 0.6, after=0.6)
    d.hold_until(d.cue("the typical offer") - 0.3)
    d.highlight(".offer-box")
    d.hold_until(d.cue("The chance indicator") - 1.6)
    d.unhighlight()
    d.scroll_to(page.evaluate("""(() => { const h = [...document.querySelectorAll('#main h2')].find(e => /Your chances/.test(e.textContent));
        return h ? h.getBoundingClientRect().top + document.getElementById('detail').scrollTop - 140 : 400; })()"""), 1.2)
    d.zoom_to([1.25, 1260, 560], 0.9)
    d.hold_until(d.cue("not a guarantee") + 0.8)
    d.zoom_to([1.0, 960, 540], 0.7)
    d.click('.toolbar [data-action="fav"]', 0.7, after=0.9)
    d.hold_until(end)

    # 4. Summer schools and contextual offers.
    end = d.scene("summer", durs["summer"])
    d.click('a[data-nav="summer"]', 0.8, after=0.6)
    d.hold_until(d.cue("including 59") - 1.2)
    d.click('[data-sf="lowers"]', 0.6, after=0.5)
    d.highlight("text=/\\d+ programmes/")
    d.hold_until(d.cue("if you meet") - 0.2)
    d.unhighlight()
    d.scroll_to(260, 1.0)
    d.hold_until(d.cue("You can also check") - 1.2)
    d.click('a[data-nav="contextual"]', 0.6, after=0.6)
    d.highlight("#main .card >> nth=0")
    d.hold_until(end - 0.4)
    d.unhighlight()
    d.hold_until(end)

    # 5. Favourites and What ifs.
    end = d.scene("favourites", durs["favourites"])
    d.click('a[data-nav="favourites"]', 0.6, after=0.6)
    d.highlight("#main .course-row >> nth=0")
    d.hold_until(d.cue("And with What ifs") - 0.9)
    d.unhighlight()
    d.click('a[data-nav="whatif"]', 0.6, after=0.5)
    d.move('select[data-scope="whatif"][data-id="s1"]', 0.6)
    d.click_at = d.t
    page.select_option('select[data-scope="whatif"][data-id="s1"]', "A*")
    d.wait(0.4, fresh_for=0.4)
    d.highlight("#main .summary-card")
    d.hold_until(end - 2.9)
    d.unhighlight()
    d.click('[data-action="whatif-off"]', 0.6, after=0.6)
    d.hold_until(end)

    # 6. Timeline and backup.
    end = d.scene("timeline", durs["timeline"])
    d.click('a[data-nav="timeline"]', 0.6, after=0.6)
    d.highlight(".tl__here-pill")
    d.wait(0.8)
    d.unhighlight()
    d.scroll_to(700, 2.0)
    d.hold_until(d.cue("And in Settings") - 2.0)
    d.click('a[data-nav="settings"]', 0.6, after=0.4)
    d.scroll_into("h2:has-text('Back up and restore')", 200, 1.0)
    d.highlight("h2:has-text('Back up and restore') >> xpath=..")
    d.hold_until(end - 0.3)
    d.unhighlight()
    d.hold_until(end)

    # 7. Closing.
    end = d.scene("closing", durs["closing"])
    d.click('a[data-nav="explore"]', 0.8, after=0.6)
    d.click('[data-action="clear-q"]', 0.6, after=0.4)
    d.click('[data-quick="match"]', 0.5, after=0.3)
    d.click('[data-quick="rg"]', 0.5, after=0.5)
    d.move([1560, 830], 1.2)
    d.zoom_to([1.05, 1180, 520], 4.0)
    d.titles.append({"start": round(end - 5.2, 2), "end": round(end + 1.2, 2), "text": "Uni Bob", "sub": "Make your next step clearer."})
    d.hold_until(end + 1.4)
    return d


def main():
    durs = json.load(open(os.path.join(OUT, "voice", "durations.json")))["durations"]
    shutil.rmtree(FRAMES, ignore_errors=True)
    os.makedirs(FRAMES)
    from playwright.sync_api import sync_playwright
    st = state("dark")
    st["favourites"] = {"unis": [], "courses": []}
    st["explore"] = {"filters": {"maxMiles": 450}}   # "Any distance", so Explore shows all 436 courses at 64 unis
    httpd = start(8772)
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR, color_scheme="dark", locale="en-GB")
            ctx.add_init_script(f"localStorage.setItem('unibob:v1', {json.dumps(json.dumps(st))});")
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto("http://127.0.0.1:8772/index.html?nosw#/explore")
            page.wait_for_selector("#main .page", timeout=15000)
            page.wait_for_timeout(2500)          # let the greeting splash finish
            d = run(page, durs)
            b.close()
    finally:
        httpd.shutdown()
    json.dump({"fps": FPS, "width": 1920, "height": 1080, "frames": d.frames, "scenes": d.scenes, "titles": d.titles},
              open(os.path.join(OUT, "timeline.json"), "w"))
    print(f"{len(d.frames)} frames ({len(d.frames) / FPS:.1f}s), {d.images} screenshots; errors: {errors or 'none'}")
    for s in d.scenes:
        print(f"  {s['id']:11} starts {s['start']:6.1f}s, narration {s['dur']:.1f}s")


if __name__ == "__main__":
    main()
