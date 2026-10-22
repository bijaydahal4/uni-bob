#!/usr/bin/env python3
"""Take WebKit screenshots of Uni Bob at iPad, iPhone and Mac sizes, in light and dark.

Usage:
  .venv/bin/python tools/screenshots.py                    # everything
  .venv/bin/python tools/screenshots.py --sizes ipad-l --themes light --pages explore,uni
Screenshots go to research/tmp/shots/ (not committed). Console errors are printed at the end.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serve import start  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "research", "tmp", "shots")
PORT = 8766

SIZES = {
    "ipad-p": (820, 1180), "ipad-l": (1180, 820), "mini-p": (744, 1133), "pro13-p": (1032, 1376),
    "pro13-l": (1376, 1032), "phone": (390, 844), "mac": (1440, 900),
}

# A test profile (not a real person).
def state(theme, onboarded=True):
    return {
        "version": 1,
        "profile": {"name": "Sam", "subjects": [
            {"id": "s1", "name": "Mathematics", "board": "Edexcel", "grade": "A"},
            {"id": "s2", "name": "Geography", "board": "AQA", "grade": "A"},
            {"id": "s3", "name": "Psychology", "board": "Edexcel", "grade": "A"}],
            "gcse": {"maths": None, "english": None}},
        "settings": {"theme": theme, "onboarded": onboarded},
        "favourites": {"unis": ["bath"], "courses": []},
        "tracker": {}, "contextual": {}, "whatIf": {"active": False, "current": None, "currentId": None, "saved": []},
        "explore": None, "meta": {"lastGreeting": "", "lastDataVersion": None, "persisted": None},
    }


def first_course(page, uni):
    return page.evaluate(f"""fetch('data/universities.json').then(r => r.json()).then(d => {{
        const u = d.unis.find(x => x.id === '{uni}') || d.unis[0];
        const c = u.courses.find(c => (c.types||[]).includes('economics')) || u.courses[0];
        return c.id; }})""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", default=",".join(SIZES))
    ap.add_argument("--themes", default="light,dark")
    ap.add_argument("--pages", default="explore,filters,uni,course,favourites,summer,whatif,contextual,timeline,settings,sidebar,onboarding,splash")
    ap.add_argument("--uni", default="bath")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    httpd = start(PORT)
    errors = []
    base = f"http://127.0.0.1:{PORT}/index.html?nosw"
    try:
        with sync_playwright() as p:
            browser = p.webkit.launch()
            for size in a.sizes.split(","):
                w, h = SIZES[size]
                for theme in a.themes.split(","):
                    for pg in a.pages.split(","):
                        onboard = pg != "onboarding"
                        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, has_touch=size != "mac",
                                                  locale="en-GB", reduced_motion="reduce")
                        ctx.add_init_script(f"localStorage.setItem('unibob:v1', {json.dumps(json.dumps(state(theme, onboard)))});")
                        page = ctx.new_page()
                        page.on("console", lambda m, s=size, t=theme, q=pg: m.type == "error" and errors.append(f"{s}/{t}/{q}: {m.text}"))
                        page.on("pageerror", lambda e, s=size, t=theme, q=pg: errors.append(f"{s}/{t}/{q}: PAGEERROR {e}"))
                        route = {"explore": "#/explore", "filters": "#/explore", "favourites": "#/favourites", "summer": "#/summer",
                                 "whatif": "#/whatif", "contextual": "#/contextual", "timeline": "#/timeline", "settings": "#/settings",
                                 "sidebar": "#/explore", "onboarding": "", "splash": "#/explore", "uni": f"#/uni/{a.uni}"}.get(pg, "#/explore")
                        page.goto(base + route)
                        if pg == "splash":
                            page.wait_for_timeout(300)
                        elif pg == "onboarding":
                            page.wait_for_selector(".ob")
                        else:
                            page.wait_for_selector("#main .page", timeout=15000)
                            if pg == "course":
                                cid = first_course(page, a.uni)
                                page.goto(base + f"#/course/{cid}")
                                page.wait_for_selector("#main .page")
                            if pg == "filters":
                                page.click('[data-action="filters"]')
                                page.wait_for_selector("dialog.sheet[open]")
                            if pg == "sidebar" and page.is_visible(".toolbar__sidebar"):
                                page.click(".toolbar__sidebar")
                            page.wait_for_timeout(250)
                        page.screenshot(path=os.path.join(OUT, f"{size}-{theme}-{pg}.png"))
                        ctx.close()
            browser.close()
    finally:
        httpd.shutdown()
    print(f"Saved screenshots to {OUT}")
    if errors:
        print("CONSOLE ERRORS:")
        for e in errors:
            print("  ", e)
    else:
        print("No console errors.")


if __name__ == "__main__":
    main()
