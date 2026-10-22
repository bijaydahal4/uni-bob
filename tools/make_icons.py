#!/usr/bin/env python3
"""Render icons/icon.svg to the PNG icons the app needs.

Usage: .venv/bin/python tools/make_icons.py
- apple-touch-icon.png (180, full square: iOS rounds the corners itself)
- icon-192.png, icon-512.png (rounded), favicon-32.png
- icon-maskable-512.png (full square, artwork inside the safe zone)
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")


def variants(svg):
    square = svg.replace('rx="112"', 'rx="0"')
    inner = re.search(r"(<g transform=.*</text>)", svg, re.S).group(1)
    maskable = square.replace(inner, f'<g transform="translate(51.2 51.2) scale(0.8)">{inner}</g>')
    return {"rounded": svg, "square": square, "maskable": maskable}


def main():
    from playwright.sync_api import sync_playwright
    svg = open(os.path.join(ICONS, "icon.svg"), encoding="utf-8").read()
    v = variants(svg)
    jobs = [
        ("apple-touch-icon.png", "square", 180, False),
        ("icon-192.png", "rounded", 192, True),
        ("icon-512.png", "rounded", 512, True),
        ("favicon-32.png", "rounded", 32, True),
        ("icon-maskable-512.png", "maskable", 512, False),
    ]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)
        for name, kind, size, transparent in jobs:
            markup = v[kind].replace("<svg ", f'<svg width="{size}" height="{size}" ', 1)
            page.set_viewport_size({"width": size, "height": size})
            page.set_content(f"<html><body style='margin:0;background:transparent'>{markup}</body></html>")
            page.screenshot(path=os.path.join(ICONS, name), omit_background=transparent,
                            clip={"x": 0, "y": 0, "width": size, "height": size})
            print("wrote", name)
        browser.close()


if __name__ == "__main__":
    main()
