"""Contact sheet of raw frames at given times: .venv/bin/python tools/video/sheet.py 20 30 42 … → video/sheet.jpg"""
import base64, json, os, sys
from playwright.sync_api import sync_playwright
V = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'video')
tl = json.load(open(os.path.join(V, 'timeline.json')))
cells = ''
for t in sys.argv[1:]:
    f = tl['frames'][min(len(tl['frames']) - 1, int(float(t) * tl['fps']))]
    b64 = base64.b64encode(open(os.path.join(V, 'frames', f"{f['img']:05d}.jpg"), 'rb').read()).decode()
    cells += f"<figure><img src='data:image/jpeg;base64,{b64}'><figcaption>{t}s zoom {f['zoom'][0]} hl {'y' if f['hl'] else '-'}</figcaption></figure>"
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1800, 'height': 900})
    pg.set_content(f"<body style='margin:0;background:#666;font:16px system-ui'><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px'>{cells}</div><style>figure{{margin:0;background:#fff}}img{{width:100%;display:block}}figcaption{{padding:2px 6px}}</style></body>")
    pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(V, 'sheet.jpg'), full_page=True, type='jpeg', quality=80); b.close()
