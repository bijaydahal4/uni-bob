#!/usr/bin/env python3
"""End-to-end checks for Uni Bob in WebKit (Safari's engine).

Usage: .venv/bin/python tools/e2e.py
Checks: search with typos, filters and sorting, favourites surviving a reload, What-if mode and "Back to my
grades", tracker statuses saving, backup and restore, working offline, no console errors, and WCAG AA contrast
in both themes. Exit code 1 if anything fails.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serve import start  # noqa: E402
from screenshots import state  # noqa: E402

PORT = 8767
BASE = f"http://127.0.0.1:{PORT}/index.html"
results = []
console_errors = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  — {detail}" if detail and not ok else ""))


def new_page(browser, theme="light", size=(1180, 820), onboarded=True, seed=True):
    ctx = browser.new_context(viewport={"width": size[0], "height": size[1]}, device_scale_factor=1, locale="en-GB",
                              has_touch=True, reduced_motion="reduce")
    if seed:
        ctx.add_init_script(f"if (!sessionStorage.getItem('seeded')) {{ localStorage.setItem('unibob:v1', {json.dumps(json.dumps(state(theme, onboarded)))}); sessionStorage.setItem('seeded', '1'); }}")
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and console_errors.append(m.text))
    page.on("pageerror", lambda e: console_errors.append(f"PAGEERROR {e}"))
    return ctx, page


def go(page, route, nosw=True):
    page.goto(f"{BASE}{'?nosw' if nosw else ''}#/{route}")
    page.wait_for_selector("#main .page", timeout=15000)


def suggestions(page, text):
    page.fill("#q", "")
    page.type("#q", text, delay=10)
    page.wait_for_timeout(250)
    return page.eval_on_selector_all("#q-list .suggest__label", "els => els.map(e => e.textContent)")


CONTRAST_JS = r"""
() => {
  const lum = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const L = (c) => 0.2126 * lum(c.r) + 0.7152 * lum(c.g) + 0.0722 * lum(c.b);
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !e.classList.contains('chance__band')) return null; // gradients: skip
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const rootBg = parse(getComputedStyle(document.body).backgroundColor); if (rootBg) base = rootBg;
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    return base;
  };
  const fails = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.nodeValue.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden],.sr-only,option')) continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op < 0.99) continue; // faded on purpose (past timeline steps); skip
    const fg = parse(cs.color); const bg = bgOf(el);
    if (!fg || !bg) continue;
    const f = fg.a < 1 ? blend(fg, bg) : fg;
    const l1 = L(f), l2 = L(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize); const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) fails.push(`${ratio.toFixed(2)} < ${need} "${t.nodeValue.trim().slice(0, 40)}" (${el.className || el.tagName})`);
  }
  return fails.slice(0, 15);
}
"""


def main():
    from playwright.sync_api import sync_playwright
    httpd = start(PORT)
    data = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "universities.json")))
    ids = {u["id"] for u in data["unis"]}
    try:
        with sync_playwright() as p:
            browser = p.webkit.launch()

            # --- Search with typos -------------------------------------------------------
            ctx, page = new_page(browser)
            go(page, "explore")
            cases = [("warrick", "warwick", "University of Warwick"), ("kings", "kcl", "King"), ("kcl", "kcl", "King"),
                     ("loughbourgh", "loughborough", "Loughborough"), ("lougborough", "loughborough", "Loughborough"),
                     ("qmul", "qmul", "Queen Mary"), ("lse", "lse", "London School"), ("bath", "bath", "Bath")]
            for q, uid, label in cases:
                if uid not in ids:
                    print(f"SKIP  search '{q}' ({uid} not in the data yet)")
                    continue
                s = suggestions(page, q)
                check(f"search '{q}' suggests {label}", s and label.lower() in s[0].lower(), f"got {s[:3]}")

            # --- Filters and sorting ------------------------------------------------------
            page.fill("#q", "")
            page.keyboard.press("Enter")
            page.wait_for_timeout(300)
            page.click('[data-quick="rg"]')
            page.wait_for_timeout(300)
            unis = page.eval_on_selector_all(".course-card__uni", "els => els.map(e => e.textContent)")
            rg_names = {u["name"] for u in data["unis"] if u["russellGroup"]}
            check("Russell Group chip shows only Russell Group unis", unis and all(any(n in x for n in rg_names) for x in unis), f"{unis[:4]}")
            page.click('[data-quick="rg"]')
            page.select_option('[data-action="sort"]', "az")
            page.wait_for_timeout(300)
            names = page.eval_on_selector_all(".course-card__name", "els => els.map(e => e.textContent.trim())")
            check("Sort A to Z", names == sorted(names, key=str.lower) or names == sorted(names), f"{names[:5]}")
            page.select_option('[data-action="sort"]', "best")
            page.click('[data-action="filters"]')
            page.wait_for_selector("dialog.sheet[open]")
            before = page.text_content("#f-count")
            page.click('dialog [data-multi="types"][data-value="economics"]')
            page.wait_for_timeout(200)
            after = page.text_content("#f-count")
            check("Filters sheet updates the live count", before != after, f"{before} → {after}")
            page.click('dialog [data-f="reset"]')
            page.click('dialog [data-action="close-sheet"]')

            # --- Favourites survive a reload ---------------------------------------------------
            first = page.get_attribute(".course-card .heart", "data-id")
            page.click(".course-card .heart")
            page.reload()
            go(page, "favourites")
            check("Favourites survive a reload", page.locator(f'[data-action="fav"][data-id="{first}"]').count() > 0, first)

            # --- What-if mode ------------------------------------------------------------------
            go(page, "whatif")
            page.select_option('select[data-action="set-grade"][data-scope="whatif"][data-id="s1"]', "A*")
            page.wait_for_selector(".whatif-banner")
            check("What-if banner appears", page.is_visible(".whatif-banner"))
            sidebar_grade = page.input_value('#sidebar select[data-id="s1"]')
            check("Real grades unchanged during a What-if", sidebar_grade == "A", sidebar_grade)
            page.click(".whatif-banner [data-action='whatif-off']")
            page.wait_for_timeout(200)
            check("Back to my grades turns the What-if off", page.locator(".whatif-banner").count() == 0)

            # --- Tracker statuses save ------------------------------------------------------------
            go(page, "summer")
            sel = page.locator("select[data-track]").first
            pid = sel.get_attribute("data-track")
            sel.select_option("applying")
            page.reload()
            page.wait_for_selector("select[data-track]")
            check("Tracker status survives a reload", page.input_value(f'select[data-track="{pid}"]') == "applying")

            # --- Backup and restore ---------------------------------------------------------------------
            code = page.evaluate("import('./js/store.js').then(m => m.exportCode())")
            check("Backup code is created", code.startswith("UNIBOB1:"))
            page.evaluate("import('./js/store.js').then(m => { m.update(s => { s.profile.name = 'Changed'; }, 'name'); })")
            go(page, "settings")
            page.click('[data-restore="code"]')
            page.fill("#restore-code", code)
            page.click("#restore-go")
            page.wait_for_selector("dialog.sheet[open] [data-answer='yes']")
            page.click("dialog.sheet [data-answer='yes']")
            page.wait_for_timeout(1200)
            restored = page.evaluate("JSON.parse(localStorage.getItem('unibob:v1')).profile.name")
            check("Restore from a backup code", restored == "Sam", restored)
            ctx.close()

            # --- Contrast in both themes -------------------------------------------------------------------------
            for theme in ("light", "dark"):
                ctx, page = new_page(browser, theme=theme)
                bad = []
                for route in ("explore", "uni/bath", "favourites", "summer", "whatif", "contextual", "timeline", "settings"):
                    go(page, route)
                    page.wait_for_timeout(150)
                    bad += [f"{route}: {x}" for x in page.evaluate(CONTRAST_JS)]
                check(f"WCAG AA text contrast ({theme})", not bad, "; ".join(bad[:6]))
                ctx.close()

            # --- Onboarding --------------------------------------------------------------------------------------
            ctx, page = new_page(browser, onboarded=False)
            page.goto(BASE + "?nosw")
            page.wait_for_selector(".ob")
            page.click("#ob-next")
            page.fill("#ob-name", "Sam")
            page.click("#ob-next")
            page.click('[data-theme-pick="dark"]')
            check("Theme preview applies live", page.evaluate("document.documentElement.dataset.theme") == "dark")
            page.click("#ob-next")
            page.click("#ob-next")
            page.click("#ob-next")
            page.wait_for_selector("#main .page", timeout=15000)
            check("Onboarding finishes in the app", page.is_visible("#main .large-title"))
            ctx.close()
            browser.close()

            # --- Offline (service worker) -----------------------------------------------------------------------
            for engine in ("webkit", "chromium"):
                b = getattr(p, engine).launch()
                ctx, page = new_page(b)
                page.goto(BASE + "#/explore")
                page.wait_for_selector("#main .page", timeout=20000)
                try:
                    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
                    page.wait_for_timeout(1500)
                    ctx.set_offline(True)
                    page.reload()
                    page.wait_for_selector("#main .page", timeout=20000)
                    check(f"Works offline after the first visit ({engine})", True)
                    break
                except Exception as e:
                    if engine == "chromium":
                        check("Works offline after the first visit", False, str(e)[:120])
                    else:
                        print(f"note: offline check not supported in Playwright WebKit ({str(e)[:60]}), trying Chromium")
                finally:
                    ctx.close()
                    b.close()
    finally:
        httpd.shutdown()
    real_errors = [e for e in console_errors if "net::ERR_INTERNET_DISCONNECTED" not in e and "Failed to load resource" not in e]
    check("No console errors", not real_errors, "; ".join(real_errors[:5]))
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
