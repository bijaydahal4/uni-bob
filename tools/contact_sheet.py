#!/usr/bin/env python3
"""Combine screenshots into one labelled contact sheet per size and theme, for quick visual review.

Usage: .venv/bin/python tools/contact_sheet.py   →  research/tmp/shots/sheet-<size>-<theme>.png
"""
import base64
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "research", "tmp", "shots")


def main():
    from playwright.sync_api import sync_playwright
    groups = {}
    for p in sorted(glob.glob(os.path.join(SHOTS, "*.png"))):
        m = re.match(r"(.+?)-(light|dark)-(.+)\.png$", os.path.basename(p))
        if m and not os.path.basename(p).startswith("sheet-"):
            groups.setdefault((m.group(1), m.group(2)), []).append((m.group(3), p))
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 2000, "height": 1000})
        for (size, theme), items in sorted(groups.items()):
            cols = 7 if size == "phone" else 4 if size.endswith("-l") or size == "mac" else 5
            # Embedded as data URIs: a page made with set_content can't load file:// images.
            cells = "".join(
                f"<figure><img src='data:image/png;base64,{base64.b64encode(open(p, 'rb').read()).decode()}'>"
                f"<figcaption>{name}</figcaption></figure>" for name, p in items)
            page.set_content(f"""<html><body style="margin:0;background:#888;font:600 18px system-ui">
              <h1 style="margin:8px 12px;font-size:22px">{size} · {theme}</h1>
              <div style="display:grid;grid-template-columns:repeat({cols},1fr);gap:10px;padding:10px">{cells}</div>
              <style>figure{{margin:0;background:#fff}} img{{width:100%;display:block}} figcaption{{padding:4px 8px}}</style>
              </body></html>""")
            page.wait_for_timeout(300)
            out = os.path.join(SHOTS, f"sheet-{size}-{theme}.png")
            page.screenshot(path=out, full_page=True)
            print("wrote", os.path.relpath(out, ROOT))
        browser.close()


if __name__ == "__main__":
    main()
