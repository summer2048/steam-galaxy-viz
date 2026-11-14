"""Build the single-file, fully offline page.

Usage: python scripts/build.py scripts/template.html data/dash_offline.json data/assets.json steam_tag_dashboard.html
The faction mapping is read from ../tag_families.csv (edit that file to move a tag to another faction).
Derived metrics (year-adjusted success, growth) are added here by derive.py, so the data file itself stays as exported.
"""
import sys, os, csv, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from derive import derive

tpl, data, assets, out = sys.argv[1:5]
html = open(tpl, encoding='utf-8').read()
js = json.dumps(derive(json.load(open(data, encoding='utf-8'))), ensure_ascii=False, separators=(',', ':')).replace('</', r'<\/')
fam_csv = os.path.join(os.path.dirname(os.path.abspath(tpl)), '..', 'tag_families.csv')
fams = {r['tag']: r['family'] for r in csv.DictReader(open(fam_csv, encoding='utf-8-sig'))}
html = html.replace('__FAMILIES__', json.dumps(fams, ensure_ascii=False).replace('</', r'<\/'))
i18n = os.path.join(os.path.dirname(os.path.abspath(tpl)), 'i18n_en.json')
html = html.replace('__I18N__', json.dumps(json.load(open(i18n, encoding='utf-8')), ensure_ascii=False).replace('</', r'<\/'))
html = html.replace('__ASSETS__', open(assets, encoding='utf-8').read())
open(out, 'w', encoding='utf-8').write(html.replace('__DATA__', js))
