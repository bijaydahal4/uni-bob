#!/usr/bin/env python3
"""Run the logic unit tests in WebKit (Safari's engine).

Usage: .venv/bin/python tools/run_tests.py
Exits non-zero if any test fails.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serve import start  # noqa: E402

PORT = 8765


def main():
    from playwright.sync_api import sync_playwright
    httpd = start(PORT)
    failed = 0
    try:
        with sync_playwright() as p:
            browser = p.webkit.launch()
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"http://127.0.0.1:{PORT}/tests/index.html")
            page.wait_for_function("window.__done === true", timeout=30000)
            results = page.evaluate("window.__results")
            for r in results:
                print(("PASS  " if r["ok"] else "FAIL  ") + r["name"])
                if not r["ok"]:
                    print("      " + r["error"])
                    failed += 1
            for e in errors:
                print("PAGE ERROR:", e)
                failed += 1
            print(f"\n{len(results) - failed}/{len(results)} passed (WebKit)")
            browser.close()
    finally:
        httpd.shutdown()
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
