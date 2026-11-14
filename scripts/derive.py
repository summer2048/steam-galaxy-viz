"""Derived per-tag metrics, computed from the aggregates export.py already writes. Standard library only.

    derive(data)   adds the fields below in place; safe to run twice. build.py calls it on every build,
                   so an older dash_offline.json gets the same fields without re-running the pipeline.

    python scripts/derive.py data/dash_offline.json tag_metrics.csv
                   writes one row per tag with the main metrics.

Added fields
    base.year_t    {n, hits} per share-year for tagged games only (the baseline every tag is compared with).
                   export.py writes it exactly; for older files it is rebuilt from the per-tag yearly shares.
    tag.hit_exp    success rate the tag would have if each of its release years did as well as all tagged games
                   of that year: sum(n_y * base_rate_y) / sum(n_y) over 2018-2024.
    tag.hit_idx    hit / hit_exp. 1.0 = exactly what its release years predict.
    tag.hit_adj    hit_idx * base.hit: the year-adjusted success rate (indirect standardisation), in the same
                   unit as hit, so it can share an axis with it.
    tag.yrate      the tag's success rate in each year 2018-2024 (None under 30 games).
    tag.grow       {rel, hits}: mean share of releases / of hits in 2022-2024 divided by the same in 2018-2020.
                   Both are shares within a year, so the fact that newer games have had less time cancels out.

A game released in 2018 has had seven years to reach 500 reviews, one from 2024 barely one. Tags full of recent
games therefore look worse than they are; hit_adj removes that. It is still a correlation, not a cause.
"""
import sys, json, csv

SCOPE = range(2018, 2025)          # the analysis window
EARLY, LATE = (2018, 2019, 2020), (2022, 2023, 2024)
DEAD = ('hit_o', 'hit_g', 'own_med', 'own_b')            # dropped from the page (issue 005); old data files still carry them
DEAD_SHARE, DEAD_PSTAT = ('revenue', 'ccu'), ('on_sale', 'disc')


def r4(v):
    return None if v is None else round(v, 4)


def tagged_years(data):
    """Tagged games and hits per share-year. Rebuilt as sum(tag counts) / sum(tag shares) when export.py did not write it."""
    base, sy, years = data['base'], data['labels']['share_years'], data['labels']['years']
    if 'year_t' in base:
        return base['year_t']
    n, hits = [], []
    for j, y in enumerate(sy):
        i = years.index(y)
        tn = th = sn = sh = 0.0
        for d in data['tags'].values():
            if d['yshare']['rel'][j] > 0:
                tn += d['year']['n'][i]; sn += d['yshare']['rel'][j]
            if d['yshare']['hits'][j] > 0:
                th += d['year']['hits'][i]; sh += d['yshare']['hits'][j]
        n.append(round(tn / sn) if sn else 0)
        hits.append(round(th / sh) if sh else 0)
    return {'n': n, 'hits': hits}


def derive(data):
    base, tags = data['base'], data['tags']
    sy, years = data['labels']['share_years'], data['labels']['years']
    yt = base['year_t'] = tagged_years(data)
    rate = {y: yt['hits'][j] / yt['n'][j] for j, y in enumerate(sy) if yt['n'][j]}
    for d in list(tags.values()) + [base]:
        for k in DEAD: d.pop(k, None)
        for k in DEAD_SHARE: d['share'].pop(k, None)
        for k in DEAD_PSTAT: d['pstat'].pop(k, None)
    base.update(hit_exp=base['hit'], hit_idx=1.0, hit_adj=base['hit'],
                yrate=[r4(rate.get(y)) for y in SCOPE], grow={'rel': 1.0, 'hits': 1.0})
    mean = lambda a, ys: sum(a[sy.index(y)] for y in ys) / len(ys)
    for d in tags.values():
        ns = [d['year']['n'][years.index(y)] for y in SCOPE]
        hs = [d['year']['hits'][years.index(y)] for y in SCOPE]
        exp = sum(n * rate[y] for n, y in zip(ns, SCOPE)) / max(1, sum(ns))
        d['hit_exp'] = r4(exp)
        d['hit_idx'] = r4(d['hit'] / exp) if exp else None
        d['hit_adj'] = r4(d['hit'] / exp * base['hit']) if exp else d['hit']
        d['yrate'] = [r4(h / n) if n >= 30 else None for n, h in zip(ns, hs)]
        ys = d['yshare']
        g = lambda k: r4(mean(ys[k], LATE) / mean(ys[k], EARLY)) if mean(ys[k], EARLY) > 0 else None
        d['grow'] = {'rel': g('rel'), 'hits': g('hits')}
    return data


COLS = [('tag', lambda t, d, f: t), ('family', lambda t, d, f: f.get(t, 'other')), ('outcome_tag', lambda t, d, f: int(d['outcome'])),
        ('games', lambda t, d, f: d['n']), ('hits', lambda t, d, f: d['hits']),
        ('hit_rate', lambda t, d, f: d['hit']), ('hit_rate_expected', lambda t, d, f: d['hit_exp']),
        ('hit_index', lambda t, d, f: d['hit_idx']), ('hit_rate_year_adjusted', lambda t, d, f: d['hit_adj']),
        ('median_rating', lambda t, d, f: d['score']), ('share_released_2022plus', lambda t, d, f: d['recent']),
        ('median_list_price', lambda t, d, f: d['price']), ('hits_median_price', lambda t, d, f: d['pstat']['hit_p50']),
        ('gross_p90_upper_bound', lambda t, d, f: d.get('gross_p90')),
        ('share_games', lambda t, d, f: d['share']['games']), ('share_reviews', lambda t, d, f: d['share']['reviews']),
        ('share_hits', lambda t, d, f: d['share']['hits']),
        ('supply_growth', lambda t, d, f: d['grow']['rel']), ('hit_share_growth', lambda t, d, f: d['grow']['hits']),
        ('top1_review_share', lambda t, d, f: d['conc']['top1']), ('top10_review_share', lambda t, d, f: d['conc']['top10']),
        ('chinese_support', lambda t, d, f: d['zh']), ('developers', lambda t, d, f: d['comp']['devs']),
        ('debut_hit_rate', lambda t, d, f: d['comp']['hit_debut']), ('veteran_hit_rate', lambda t, d, f: d['comp']['hit_vet'])]

if __name__ == '__main__':
    import os
    src, out = sys.argv[1:3]
    data = derive(json.load(open(src, encoding='utf-8')))
    fam_csv = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tag_families.csv')
    fams = {r['tag']: r['family'] for r in csv.DictReader(open(fam_csv, encoding='utf-8-sig'))}
    rows = sorted(data['tags'].items(), key=lambda kv: -(kv[1]['hit_adj'] or 0))
    with open(out, 'w', encoding='utf-8-sig', newline='') as fh:
        wr = csv.writer(fh)
        wr.writerow([c for c, _ in COLS])
        for t, d in rows:
            wr.writerow(['' if v is None else v for v in (f(t, d, fams) for _, f in COLS)])
    print(len(rows), 'tags ->', out)
