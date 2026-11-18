"""Export a compact per-game table so the page can answer ad-hoc questions (tag combos, plans, similar games).

Usage: python export_games.py clean.pkl data/dash_offline.json data/games.json

Every tagged game of every year is kept (the trend views need all years). Columns are little-endian typed
arrays in base64; scripts/db.js decodes them. Definitions (success thresholds, outcome tags, cover indices)
are read from dash_offline.json so this table can't drift from the per-tag aggregates.
"""
import sys, re, json, base64, pandas as pd, numpy as np
from collections import Counter

pkl, dash_path, out = sys.argv[1:4]
dash = json.load(open(dash_path, encoding='utf-8'))
OWN_T, GROSS_T = dash['meta']['own_t'], dash['meta']['gross_t']

df = pd.read_pickle(pkl)
df = df[df.tags.map(len) > 0].sort_values(['year', 'appid']).reset_index(drop=True)
disc = df.discount.fillna(0)
df['list_price'] = np.where(disc.between(1, 99), df.price / (1 - disc / 100), df.price)

# ---- tags: ids by frequency so the common ones are small numbers; per-game order is kept (it is Steam's vote order)
tag_names = [t for t, _ in Counter(t for ts in df.tags for t in ts).most_common()]
tid = {t: i for i, t in enumerate(tag_names)}
assert len(tag_names) < 65536
lens = df.tags.map(len).to_numpy()
tag_off = np.concatenate([[0], np.cumsum(lens)]).astype('<u4')
tag_ids = np.fromiter((tid[t] for ts in df.tags for t in ts), dtype='<u2', count=int(lens.sum()))

# ---- languages: raw strings carry BBCode noise like "Italian \r\n\r\n[b][/b]"
clean_lang = lambda s: re.sub(r'\[/?b\].*', '', s.replace('&lt;', '<').split('<')[0], flags=re.S).strip()
norm = df.langs.map(lambda ls: {clean_lang(x) for x in ls} - {''})
LANGS = [l for l, _ in Counter(l for ls in norm for l in ls).most_common(32)]
lbit = {l: 1 << i for i, l in enumerate(LANGS)}
lang_mask = norm.map(lambda ls: sum(lbit.get(l, 0) for l in ls)).astype('<u4')

bits = lambda *ms: sum(np.asarray(m, dtype=bool).astype(int) << i for i, m in enumerate(ms)).astype('u1')

# ---- feature bits, same predicates and order as export.py FEATS
cats = df.cats
FEATS = [
    cats.map(lambda c: 'Steam Achievements' in c),
    cats.map(lambda c: 'Full controller support' in c or 'Partial Controller Support' in c),
    cats.map(lambda c: 'Multi-player' in c),
    cats.map(lambda c: 'Online Co-op' in c),
    cats.map(lambda c: 'Steam Workshop' in c),
    df.zh,
    df.mac.astype(str).str.lower() == 'true',
]
feat = bits(*FEATS)

# ---- outcome flags, computed here once so the page never re-derives thresholds
ADULT = {'Hentai', 'NSFW', 'Sexual Content', 'Nudity'}
safe = df.img.notna() & (df.age.fillna(0) < 18) & df.tags.map(lambda t: not (set(t) & ADULT))
flags = bits(df.reviews >= 500, df.owners_hi >= OWN_T, df.owners_hi * df.list_price >= GROSS_T, safe)

# ---- cover asset index from every cover list already embedded in the page. Those lists carry no appid, so the key is
# (name, review count): titles alone collide (two games are called "Portal").
cover = {}
for d in [dash['base'], *dash['tags'].values()]:
    for c in d.get('covers', []) + d.get('games', []) + d.get('wall', []):
        cover.setdefault((c['n'], c['r']), c['i'])
cov = pd.Series([cover.get((n, int(r)), -1) for n, r in zip(df.name, df.reviews)]).astype('<i2')

U32_NA = 0xFFFFFFFF
u32 = lambda s, na=U32_NA: s.fillna(na).round().astype('<u4')
cols = {
    'appid':   ('u32', df.appid.astype('<u4')),
    'year':    ('u16', df.year.astype('<u2')),
    'reviews': ('u32', u32(df.reviews, 0)),
    'pos':     ('u32', u32(df.pos, 0)),
    'cents':   ('u32', (df.price * 100).round().astype('<u4')),
    'disc':    ('u8',  disc.round().astype('u1')),
    'own':     ('u32', u32(df.owners_hi)),            # 0xFFFFFFFF = unknown
    'nlang':   ('u8',  df.n_langs.clip(upper=255).astype('u1')),
    'lang':    ('u32', lang_mask),
    'play':    ('u32', u32(df.med_play.where(df.med_play > 0), 0)),  # median minutes, 0 = no data
    'feat':    ('u8',  feat),
    'flags':   ('u8',  flags),
    'cover':   ('i16', cov),
}
b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
names = df.name.fillna('').str.replace('\n', ' ', regex=False)
res = {
    'v': 1, 'n': len(df),
    'cols': {k: [t, b64(np.asarray(a))] for k, (t, a) in cols.items()},
    'tags': tag_names, 'tag_off': b64(tag_off), 'tag_ids': b64(tag_ids),
    'names': '\n'.join(names),
    'langs': LANGS,
    'feats': dash['labels']['feats'],
    'flags': ['hit', 'hit_o', 'hit_g', 'safe'],
    'outcome': sorted(t for t, d in dash['tags'].items() if d['outcome']),
    'meta': {'own_t': OWN_T, 'gross_t': GROSS_T, 'scope': [2018, 2024], 'snapshot': dash['meta']['snapshot']},
}
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
import os
print(len(df), 'games,', len(tag_names), 'tags,', len(tag_ids), 'tag links,', (cov >= 0).sum(), 'with cover,',
      round(os.path.getsize(out) / 1e6, 2), 'MB')
