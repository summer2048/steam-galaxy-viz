"""Run scripts/e2e.js inside the built page with headless Chrome and print the results.

Usage: python scripts/e2e.py [path/to/chrome] — exits non-zero if any check fails.
Works from WSL with Windows Chrome: the page copy is written next to the built page (on the Windows drive).
"""
import sys, os, re, subprocess, html
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chrome = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'
page = open(os.path.join(root, 'steam_tag_dashboard.html'), encoding='utf-8').read()
test = open(os.path.join(root, 'scripts', 'e2e.js'), encoding='utf-8').read()
tmp = os.path.join(root, '_e2e.html')
open(tmp, 'w', encoding='utf-8').write(page.replace('</body>', f'<script>setTimeout(() => {{\n{test}\n}}, 500);</script></body>'))
def url(p):
    m = re.match(r'/mnt/([a-z])/(.*)', p)
    return 'file:///' + (f'{m.group(1).upper()}:/{m.group(2)}' if m else p.lstrip('/'))
try:
    dom = subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1440,1000', '--virtual-time-budget=60000', '--dump-dom', url(tmp) + (f'?lang={os.environ["E2E_LANG"]}' if os.environ.get('E2E_LANG') else '')],
                         capture_output=True, text=True, encoding='utf-8', timeout=300).stdout
finally:
    os.remove(tmp)
at = dom.rfind('<pre id="e2e">')   # the last one: the harness appends it at the very end
res = html.unescape(dom[at + 14:dom.index('</pre>', at)]) if at >= 0 else 'FAIL no results (the page did not finish)'
print(res)
sys.exit(1 if 'FAIL' in res else 0)
