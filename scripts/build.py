"""Build the single-file, fully offline page.

Usage: python scripts/build.py scripts/template.html data/dash_offline.json data/assets.json steam_tag_dashboard.html [data/games.json]

Placeholders in the template:
  __DATA__ __ASSETS__ __FAMILIES__ __I18N__   per-tag aggregates, covers, tag -> faction (../tag_families.csv), translations
  __GAMES__                                   per-game table (data/games.json), only read if the template uses it
  __FILE:name__                               the contents of scripts/<name> (Studio code and styles)
Derived metrics (year-adjusted success, growth) are added to __DATA__ by derive.py, so the data file itself stays as exported.
All placeholders are replaced in one pass, so text inside the data can never be mistaken for a placeholder.
"""
import sys, os, re, csv, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from derive import derive

tpl, data, assets, out = sys.argv[1:5]
here = os.path.dirname(os.path.abspath(tpl))
games = sys.argv[5] if len(sys.argv) > 5 else os.path.join(os.path.dirname(os.path.abspath(data)), 'games.json')
html = open(tpl, encoding='utf-8').read()
safe = lambda s: s.replace('</', r'<\/')   # nothing inlined may close the surrounding <script>
read = lambda p: open(p, encoding='utf-8').read()

def value(name):
    if name == 'DATA': return safe(json.dumps(derive(json.loads(read(data))), ensure_ascii=False, separators=(',', ':')))
    if name == 'ASSETS': return read(assets)
    if name == 'FAMILIES':
        fams = {r['tag']: r['family'] for r in csv.DictReader(open(os.path.join(here, '..', 'tag_families.csv'), encoding='utf-8-sig'))}
        return safe(json.dumps(fams, ensure_ascii=False))
    if name == 'I18N': return safe(json.dumps(json.load(open(os.path.join(here, 'i18n_en.json'), encoding='utf-8')), ensure_ascii=False))
    if name == 'GAMES': return safe(read(games))
    if name.startswith('FILE:'):
        src = read(os.path.join(here, name[5:]))
        return src.replace('</script', r'<\/script')
    raise KeyError(name)

cache = {}
html = re.sub(r'__(DATA|ASSETS|FAMILIES|I18N|GAMES|FILE:[\w.-]+)__', lambda m: cache.setdefault(m.group(1), value(m.group(1))), html)
open(out, 'w', encoding='utf-8').write(html)
print(out, round(os.path.getsize(out) / 1e6, 1), 'MB')
