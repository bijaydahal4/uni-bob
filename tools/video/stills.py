"""Contact sheet of stills grabbed from the finished video: python tools/video/stills.py → video/stills.jpg"""
import base64, glob, os, re
from playwright.sync_api import sync_playwright
V = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'video')
files = sorted(glob.glob(os.path.join(V, 'check', 't*.jpg')), key=lambda p: float(re.search(r't([\d.]+)\.jpg', p).group(1)))
cells = ''.join(f"<figure><img src='data:image/jpeg;base64,{base64.b64encode(open(p,'rb').read()).decode()}'><figcaption>{os.path.basename(p)[1:-4]}s</figcaption></figure>" for p in files)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1800, 'height': 900})
    pg.set_content(f"<body style='margin:0;background:#666;font:16px system-ui'><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px'>{cells}</div><style>figure{{margin:0;background:#fff}}img{{width:100%;display:block}}figcaption{{padding:2px 6px}}</style></body>")
    pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(V, 'stills.jpg'), full_page=True, type='jpeg', quality=80); b.close()
