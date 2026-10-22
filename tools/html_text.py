"""Turn raw HTML into readable text (stdlib only). Usage: python3 tools/html_text.py <file.html|url>"""
import sys, re, urllib.request
from html.parser import HTMLParser

BLOCK = {"p","div","li","tr","h1","h2","h3","h4","h5","h6","br","section","article","header","footer","td","th","dt","dd","table","ul","ol","main","aside","nav","summary","details","option","label","button","figcaption"}
SKIP = {"script","style","noscript","svg","template","iframe","head"}

class T(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.out=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in SKIP: self.skip+=1
        if tag in BLOCK: self.out.append("\n")
        if tag in ("td","th"): self.out.append(" | ")
    def handle_endtag(self, tag):
        if tag in SKIP and self.skip: self.skip-=1
        if tag in BLOCK: self.out.append("\n")
    def handle_data(self, d):
        if not self.skip: self.out.append(d)

def text_from_html(html):
    t=T(); t.feed(html)
    s="".join(t.out)
    s=re.sub(r"[ \t\r\f\v ]+"," ",s)
    s=re.sub(r"\n\s*\n+","\n",s)
    return "\n".join(l.strip() for l in s.split("\n") if l.strip())

def fetch(url):
    req=urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15","Accept-Language":"en-GB,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")

if __name__=="__main__":
    src=sys.argv[1]
    html=fetch(src) if src.startswith("http") else open(src,encoding="utf-8",errors="replace").read()
    print(text_from_html(html))
