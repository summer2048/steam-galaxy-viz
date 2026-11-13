"""Download cover art once, shrink it, and produce data for a page that needs no network.

Usage: python covers.py dash.json cache_dir dash_offline.json assets.json
Each tag keeps its K best covers; every cover becomes an integer index into the asset list.
"""
import sys, os, json, base64, hashlib, io, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

src, cache, out_data, out_assets = sys.argv[1:5]
K, SIZE, BIG, THUMB = 6, (256, 128), (480, 224), (200, 94)
FLAGS = ['City Builder', 'Colony Sim', 'Interactive Fiction', 'Narrative', 'Online Co-Op', 'Party Game', 'Pixel Graphics', 'Hand-drawn',
         'JRPG', 'CRPG', 'Farming Sim', 'Cozy', 'Survival Horror', 'Psychological Horror', 'Souls-like', 'Hack and Slash']
d = json.load(open(src, encoding='utf-8'))
cdn = d['meta']['cdn']
url = lambda i: i if i.startswith('http') else cdn + i
for t in d['tags'].values():
    t['covers'] = t['covers'][:K]
lists = [t['covers'] for t in d['tags'].values()] + [d['base']['covers'], d['base']['wall']]
uniq = {}
for l in lists:
    for c in l:
        uniq.setdefault(c['i'], len(uniq))
nbase = len(uniq)
game_lists = [t['games'] for t in d['tags'].values()] + [d['base']['games']]
for l in game_lists:
    for c in l:
        uniq.setdefault(c['i'], len(uniq))
print('covers for balls', nbase, 'all', len(uniq))

def fetch(i):
    p = os.path.join(cache, hashlib.sha1(i.encode()).hexdigest() + '.img')
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return i, p
    try:
        req = urllib.request.Request(url(i), headers={'User-Agent': 'steam-tag-dashboard'})
        data = urllib.request.urlopen(req, timeout=30).read()
        open(p, 'wb').write(data)
        return i, p
    except Exception as e:
        print('failed', i, e)
        return i, None

with ThreadPoolExecutor(12) as ex:
    paths = dict(ex.map(fetch, uniq))
ok = {i for i, p in paths.items() if p}
print('downloaded', len(ok))

def enc(path, size, q):
    im = Image.open(path).convert('RGB').resize(size, Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=5)
    return base64.b64encode(b.getvalue()).decode()

index, assets = {}, []
extra, extra_keys = [], []
for n, i in enumerate(uniq):
    if i in ok:
        try:
            if n < nbase:
                assets.append(enc(paths[i], SIZE, 68)); index[i] = len(assets) - 1
            else:
                extra.append(enc(paths[i], THUMB, 55)); extra_keys.append(i)
        except Exception as e:
            print('bad image', i, e)
for n, i in enumerate(extra_keys):
    index[i] = len(assets) + n
for l in lists + game_lists:
    l[:] = [{**c, 'i': index[c['i']]} for c in l if c['i'] in index]
big = {}
for name in FLAGS:
    for c in d['tags'].get(name, {'covers': []})['covers'][:3]:
        raw = next(k for k, v in index.items() if v == c['i'])
        big[c['i']] = enc(paths[raw], BIG, 72)
del d['meta']['cdn']
json.dump(d, open(out_data, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump({'small': assets, 'extra': extra, 'big': big}, open(out_assets, 'w'), separators=(',', ':'))
print('assets', len(assets), 'extra', len(extra), 'big', len(big), 'bytes', os.path.getsize(out_assets))
