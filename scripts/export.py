"""Export per-tag aggregates (overview, market, pricing, players, competition) for the dashboard.

Usage: python export.py clean.pkl dash.json
"""
import sys, os, json, pandas as pd, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from derive import derive

pkl, out = sys.argv[1:3]
df = pd.read_pickle(pkl)
df['list_price'] = np.where(df.discount.between(1, 99), df.price / (1 - df.discount / 100), df.price)
df['hit'] = df.reviews >= 500
# Success has one definition (>= 500 reviews). Owner counts are coarse SteamSpy bands, so the owner- and gross-based
# definitions tracked it closely (r = 0.84-0.88 across tags) without adding information; only the gross estimate is kept, for reference.
df['gross'] = df.owners_hi * df.list_price                     # upper-bound gross revenue before Steam's cut
df['play_h'] = np.where(df.med_play > 0, df.med_play / 60, np.nan)

YEARS = list(range(2010, 2026))
SHARE_YEARS = list(range(2018, 2026))
PB = ([-0.01, 0, 4.99, 9.99, 19.99, 29.99, 1e5], ['免费', '<$5', '$5–10', '$10–20', '$20–30', '$30+'])
LB = ([-1, 1, 4, 9, 1000], ['1 种', '2–4 种', '5–9 种', '10+ 种'])
RB = ([-1, 0, 9, 49, 499, 4999, np.inf], ['0', '1–9', '10–49', '50–499', '500–4,999', '5,000+'])
OB = ([-1, 20000, 50000, 200000, 1000000, np.inf], ['≤2万', '2–5万', '5–20万', '20–100万', '100万+'])
SB = ([-0.01, 0.6, 0.7, 0.8, 0.9, 1.01], ['<60%', '60–70%', '70–80%', '80–90%', '90%+'])
df['pb'] = pd.cut(df.list_price, PB[0], labels=PB[1])
df['lb'] = pd.cut(df.n_langs, LB[0], labels=LB[1])
df['rb'] = pd.cut(df.reviews, RB[0], labels=RB[1])
df['ob'] = pd.cut(df.owners_hi, OB[0], labels=OB[1])
df['sb'] = pd.cut(df.pos_ratio.where(df.reviews >= 20), SB[0], labels=SB[1])

FEATS = {  # label -> predicate over a row's categories / fields
    '成就': lambda d: d.cats.map(lambda c: 'Steam Achievements' in c),
    '手柄支持': lambda d: d.cats.map(lambda c: 'Full controller support' in c or 'Partial Controller Support' in c),
    '多人': lambda d: d.cats.map(lambda c: 'Multi-player' in c),
    '在线合作': lambda d: d.cats.map(lambda c: 'Online Co-op' in c),
    '创意工坊': lambda d: d.cats.map(lambda c: 'Steam Workshop' in c),
    '中文': lambda d: d.zh,
    'Mac': lambda d: d.mac.astype(str).str.lower() == 'true',
}
for k, f in FEATS.items():
    df['f_' + k] = f(df).astype(bool)

# Developer debut: a game is a debut if it is the earliest Steam release of its first-listed developer.
df['dev0'] = df.devs.map(lambda d: d[0] if d else None)
first = df.dropna(subset=['dev0']).groupby('dev0').date.min()
df['debut'] = (df.dev0.map(first) == df.date).astype(object)
df.loc[df.dev0.isna(), 'debut'] = np.nan

OUTCOME = {'Great Soundtrack', 'Classic', 'Beautiful', 'Masterpiece', 'Memes', 'Mature', 'Addictive', 'Moddable',
           'Cult Classic', 'Replay Value', 'Funny', 'Atmospheric', 'Difficult', 'Psychological', 'Epic', 'Story Rich',
           'Lore-Rich', 'Hentai', 'NSFW', 'Nudity', 'Sexual Content', 'Blood', 'Gore', 'Violent', 'Free to Play',
           'Early Access', 'Indie', 'Singleplayer'}
GENERIC = {'Indie', 'Singleplayer', 'Casual', 'Action', 'Adventure', '2D', '3D', 'Early Access', 'Free to Play',
           'Simulation', 'Strategy', 'RPG', 'Multiplayer', 'Colorful', 'Cute', 'Fantasy', 'Atmospheric'}

# Cover art: only games without adult content, so the wall and the map stay safe to show anywhere.
ADULT = {'Hentai', 'NSFW', 'Sexual Content', 'Nudity'}
CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/'
df['safe'] = df.img.notna() & (df.age.fillna(0) < 18) & df.tags.map(lambda t: not (set(t) & ADULT))

def covers(g, k=10):
    t = g[g.safe].nlargest(k, 'reviews')
    return [{'n': r['name'], 'i': r.img.replace(CDN, ''), 'r': int(r.reviews)} for _, r in t.iterrows()]

def games(g, k=48):
    """The category's best-known games with per-game stats, for the cover mosaic."""
    t = g[g.safe].nlargest(k, 'reviews')
    return [{'n': r['name'], 'i': r.img.replace(CDN, ''), 'r': int(r.reviews), 'p': r4(r.pos_ratio), 'c': round(float(r.list_price), 2), 'y': int(r.year),
             'o': None if pd.isna(r.ob) else str(r.ob), 'h': None if pd.isna(r.play_h) else round(float(r.play_h), 1),
             'ow': None if pd.isna(r.owners_hi) else int(r.owners_hi), 'g': None if pd.isna(r.gross) else int(r.gross)} for _, r in t.iterrows()]

r4 = lambda v: None if v is None or pd.isna(v) else round(float(v), 4)

def dist(s, labels):
    return [r4(v) for v in s.value_counts(normalize=True).reindex(labels).fillna(0)]

def rate(g, col, labels, min_n=30):
    a = g.groupby(col, observed=False).hit.agg(['mean', 'size']).reindex(labels)
    return {'rate': [None if pd.isna(v) or n < min_n else r4(v) for v, n in zip(a['mean'], a['size'])],
            'n': a['size'].fillna(0).astype(int).tolist()}

def yearly(g):
    y = g[g.year.isin(YEARS)].groupby('year').hit.agg(['size', 'sum']).reindex(YEARS, fill_value=0)
    return {'n': y['size'].astype(int).tolist(), 'hits': y['sum'].astype(int).tolist()}

def top_games(g, k=10):
    t = g.nlargest(k, 'reviews')
    return [{'name': r['name'], 'year': int(r.year), 'reviews': int(r.reviews), 'pos': r4(r.pos_ratio),
             'price': round(float(r.list_price), 2), 'owners': None if pd.isna(r.ob) else str(r.ob),
             'play': None if pd.isna(r.play_h) else round(float(r.play_h), 1)} for _, r in t.iterrows()]

def summary(u, allyears, totals):
    """u: 2018-2024 tagged games in this segment; allyears: segment across every year (for trend & top lists)."""
    s = u[u.reviews >= 20].pos_ratio
    paid = u[u.list_price > 0].list_price
    rev_sorted = u.reviews.sort_values(ascending=False)
    tot_rev = max(1, rev_sorted.sum())
    k10 = max(1, int(np.ceil(len(u) * 0.1)))
    deb = u.dropna(subset=['debut'])
    devs = allyears.explode('devs').dropna(subset=['devs']).groupby('devs').agg(
        games=('appid', 'size'), reviews=('reviews', 'sum'), hits=('hit', 'sum')).nlargest(6, 'reviews')
    dev_counts = u.dev0.value_counts()
    feats = {}
    for k in FEATS:
        has = u['f_' + k]
        w, wo = u[has], u[~has]
        feats[k] = {'share': r4(has.mean()),
                    'hit_with': r4(w.hit.mean()) if len(w) >= 30 else None,
                    'hit_without': r4(wo.hit.mean()) if len(wo) >= 30 else None}
    return {
        'n': int(len(u)), 'hit': r4(u.hit.mean()), 'hits': int(u.hit.sum()),
        'gross_med': None if u.gross.isna().all() else int(u.gross.median()),
        'gross_p90': None if u.gross.isna().all() else int(u.gross.quantile(.9)),
        'score': r4(s.median()) if len(s) else None,
        'recent': r4((u.year >= 2022).mean()),
        'price': round(float(u.list_price.median()), 2), 'zh': r4(u.zh.mean()),
        # overview
        'year': yearly(allyears),
        'rev_b': dist(u.rb, RB[1]),
        'price_b': rate(u, 'pb', PB[1]), 'lang_b': rate(u, 'lb', LB[1]),
        # market
        'share': {'games': r4(len(u) / totals['games']), 'reviews': r4(u.reviews.sum() / totals['reviews']),
                  'hits': r4(u.hit.sum() / totals['hits'])},
        'conc': {'top1': r4(rev_sorted.iloc[:1].sum() / tot_rev), 'top10': r4(rev_sorted.iloc[:10].sum() / tot_rev),
                 'top10pct': r4(rev_sorted.iloc[:k10].sum() / tot_rev), 'zero': r4((u.reviews == 0).mean())},
        # pricing
        'price_dist': dist(u.pb, PB[1]),
        'pstat': {'p25': r4(paid.quantile(.25)) if len(paid) else None, 'p50': r4(paid.median()) if len(paid) else None,
                  'p75': r4(paid.quantile(.75)) if len(paid) else None,
                  'hit_p50': r4(u[u.hit & (u.list_price > 0)].list_price.median()) if u.hit.sum() else None,
                  'free': r4((u.list_price == 0).mean()),
                  'rev_med_hit': int(u[u.hit].reviews.median()) if u.hit.sum() else None},
        # players & quality
        'score_b': dist(u.sb.dropna(), SB[1]) if u.sb.notna().any() else [0] * 5,
        'play': {'all': r4(u.play_h.median()), 'hits': r4(u[u.hit].play_h.median()), 'cov': r4(u.play_h.notna().mean())},
        'feats': feats,
        # competition
        'comp': {'devs': int(u.dev0.nunique()), 'repeat_share': r4(u.dev0.map(dev_counts).ge(3).mean()),
                 'debut_share': r4(deb.debut.mean()) if len(deb) else None,
                 'hit_debut': r4(deb[deb.debut == True].hit.mean()) if (deb.debut == True).sum() >= 30 else None,
                 'hit_vet': r4(deb[deb.debut == False].hit.mean()) if (deb.debut == False).sum() >= 30 else None},
        'devs': [{'name': n, 'games': int(r.games), 'reviews': int(r.reviews), 'hits': int(r.hits)} for n, r in devs.iterrows()],
        'top': top_games(allyears),
        'covers': covers(allyears),
        'games': games(allyears),
        'gstat': {'total': int(len(allyears)), 'reviews': int(allyears.reviews.sum())},
    }

tagged = df[df.tags.map(len) > 0]
U = tagged[(tagged.year >= 2018) & (tagged.year <= 2024)]
totals = {'games': len(U), 'reviews': U.reviews.sum(), 'hits': max(1, U.hit.sum())}
base = summary(U, df, totals)
base['wall'] = covers(df[df.year == 2024], 160)
base['untagged_share'] = r4((df[(df.year >= 2018) & (df.year <= 2024)].tags.map(len) == 0).mean())

# per-year share denominators for the market-share trend (tagged games only)
TY = tagged[tagged.year.isin(SHARE_YEARS)]
year_n = TY.groupby('year').size().reindex(SHARE_YEARS, fill_value=0)
year_h = TY.groupby('year').hit.sum().reindex(SHARE_YEARS, fill_value=0)
# the yearly baseline every tag's success rate is adjusted against (tagged games only, like base.hit)
base['year_t'] = {'n': year_n.astype(int).tolist(), 'hits': year_h.astype(int).tolist()}

eU = U[['appid', 'tags', 'hit']].explode('tags')
counts = eU.tags.value_counts()
keep = counts[counts >= 300].index
idxU = eU.groupby('tags').appid.apply(set)
idxA = tagged[['appid', 'tags']].explode('tags').groupby('tags').appid.apply(set)
Ui, Ai = U.set_index('appid'), tagged.set_index('appid')

tags = {}
for t in keep:
    u = Ui.loc[list(idxU[t])].reset_index()
    a = Ai.loc[list(idxA[t])].reset_index()
    d = summary(u, a, totals)
    d['outcome'] = t in OUTCOME
    # cover art: prefer games where this tag is among their 5 most-voted tags, so the picture actually represents the tag
    rep_games = covers(a[a.tags.map(lambda x: t in x[:5])], 10)
    seen_names = {c['n'] for c in rep_games}
    d['covers'] = rep_games + [c for c in d['covers'] if c['n'] not in seen_names]
    ty = a[a.year.isin(SHARE_YEARS)]
    yn = ty.groupby('year').size().reindex(SHARE_YEARS, fill_value=0)
    yh = ty.groupby('year').hit.sum().reindex(SHARE_YEARS, fill_value=0)
    d['yshare'] = {'rel': [r4(x) for x in (yn / year_n.replace(0, np.nan)).fillna(0)],
                   'hits': [r4(x) for x in (yh / year_h.replace(0, np.nan)).fillna(0)]}
    sub = eU[eU.appid.isin(idxU[t]) & (eU.tags != t) & ~eU.tags.isin(GENERIC)]
    co = sub.groupby('tags').hit.agg(['size', 'mean'])
    co = co[co['size'] >= 30].nlargest(12, 'size')
    d['cotags'] = [{'tag': k, 'n': int(r['size']), 'share': r4(r['size'] / len(u)), 'hit': r4(r['mean'])} for k, r in co.iterrows()]
    tags[t] = d

json.dump(derive({'base': base, 'tags': tags,
           'labels': {'price': PB[1], 'lang': LB[1], 'rev': RB[1], 'own': OB[1], 'score': SB[1], 'years': YEARS,
                      'share_years': SHARE_YEARS, 'feats': list(FEATS)},
           'meta': {'cdn': CDN, 'snapshot': '2026-03', 'universe': int(len(U))}}),
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(tags), 'tags; baseline hit', base['hit'])
