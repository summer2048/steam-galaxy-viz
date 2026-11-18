"""Thumbnails for Studio's recommendation candidates that have no embedded cover.

Usage: python scripts/game_covers.py clean.pkl data/games.json covers_cache covers [--limit N] [--threads 16]

Candidates are the games Studio can recommend (>= 50 reviews and safe to show) whose cover is not already embedded in
the page. Each image is downloaded once into covers_cache/<appid>.img: first the dataset's own image URL, then Steam's
official header for the same AppID. Every image is checked to decode, shrunk, and written as covers/<appid>.webp.
Both steps are incremental: re-running only fetches and converts what is missing. covers/_report.json records totals,
failures and size, so a build can be compared with the previous one.

The page loads covers/<appid>.webp next to the HTML file. Without the folder it still works and shows game names.
"""
import sys, os, io, json, time, base64, argparse, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('pkl'); ap.add_argument('games'); ap.add_argument('cache'); ap.add_argument('out')
ap.add_argument('--limit', type=int, default=0); ap.add_argument('--threads', type=int, default=16)
a = ap.parse_args()
SIZE, Q = (230, 107), 52
OFFICIAL = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg'
os.makedirs(a.cache, exist_ok=True); os.makedirs(a.out, exist_ok=True)

g = json.load(open(a.games, encoding='utf-8'))
col = lambda k: np.frombuffer(base64.b64decode(g['cols'][k][1]), dtype={'u8': '<u1', 'u16': '<u2', 'u32': '<u4', 'i16': '<i2'}[g['cols'][k][0]])
appid, reviews, flags, cover = col('appid'), col('reviews'), col('flags'), col('cover')
SAFE = 1 << g['flags'].index('safe')
pool = (reviews >= 50) & (flags & SAFE > 0)
embedded = int((pool & (cover >= 0)).sum())
want = appid[pool & (cover < 0)]
df = pd.read_pickle(a.pkl)[['appid', 'img']].drop_duplicates('appid').set_index('appid').img
todo = [int(x) for x in want]
if a.limit: todo = todo[:a.limit]
print(len(want), 'candidates without an embedded cover;', len(todo), 'in this run')

def decodes(p):
    try:
        with Image.open(p) as im: im.verify()
        return True
    except Exception:
        return False

def fetch(aid):
    """Returns (appid, source) where source is 'cache', 'dataset', 'official' or None."""
    p = os.path.join(a.cache, f'{aid}.img')
    if os.path.exists(p) and decodes(p): return aid, 'cache'
    urls = [u for u in [df.get(aid), OFFICIAL.format(aid)] if isinstance(u, str) and u]
    for src, u in zip(['dataset', 'official'][-len(urls):] if len(urls) == 1 else ['dataset', 'official'], urls):
        for attempt in range(2):
            try:
                data = urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'steam-tag-dashboard'}), timeout=20).read()
                open(p, 'wb').write(data)
                if decodes(p): return aid, src
                break
            except Exception:
                time.sleep(.5)
    if os.path.exists(p): os.remove(p)
    return aid, None

def convert(aid):
    o = os.path.join(a.out, f'{aid}.webp')
    if os.path.exists(o) and os.path.getsize(o) > 0: return os.path.getsize(o)
    with Image.open(os.path.join(a.cache, f'{aid}.img')) as im:
        im.convert('RGB').resize(SIZE, Image.LANCZOS).save(o, 'WEBP', quality=Q, method=5)
    return os.path.getsize(o)

t0, src, done = time.time(), {}, 0
with ThreadPoolExecutor(a.threads) as ex:
    for aid, s in ex.map(fetch, todo):
        src[aid] = s; done += 1
        if done % 1000 == 0: print(f'  {done}/{len(todo)} fetched, {time.time() - t0:.0f}s', flush=True)
ok = [x for x in todo if src[x]]
sizes = {}
for aid in ok:
    try: sizes[aid] = convert(aid)
    except Exception: src[aid] = None
ok = [x for x in todo if src[x]]
failed = [x for x in todo if not src[x]]
existing = [f for f in os.listdir(a.out) if f.endswith('.webp')]
have = sum(1 for x in want if os.path.exists(os.path.join(a.out, f'{int(x)}.webp')))
rep = {'pool': int(pool.sum()), 'embedded_in_page': embedded, 'pool_with_cover_after': embedded + have,
       'pool_coverage': round((embedded + have) / int(pool.sum()), 4), 'candidates': int(len(want)), 'this_run': len(todo), 'ok': len(ok), 'failed': len(failed),
       'by_source': {k: sum(1 for x in todo if src[x] == k) for k in ['cache', 'dataset', 'official']},
       'files_in_folder': len(existing), 'folder_bytes': int(sum(os.path.getsize(os.path.join(a.out, f)) for f in existing)),
       'avg_bytes': round(float(np.mean(list(sizes.values()))), 1) if sizes else None, 'failed_appids': failed,
       'seconds': round(time.time() - t0, 1)}
json.dump(rep, open(os.path.join(a.out, '_report.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in rep.items() if k != 'failed_appids'}, indent=1), '\nfailed:', failed[:20], '...' if len(failed) > 20 else '')
