import sys, pandas as pd, numpy as np
pd.set_option('display.width',200)
df = pd.read_pickle(sys.argv[1])
print('2026 by month:', df[df.year==2026].date.dt.month.value_counts().sort_index().to_dict())
print('total', len(df))
b = pd.cut(df.reviews, [-1,0,9,49,499,4999,np.inf], labels=['0','1-9','10-49','50-499','500-4999','5000+'])
print(b.value_counts(normalize=True).sort_index().round(3))
print('share of all reviews held by top 1% games:', df.reviews.nlargest(int(len(df)*0.01)).sum()/df.reviews.sum())
df['hit'] = df.reviews>=500
r = df[df.reviews>=10]
print('median pos ratio (>=10 rev):', r.pos_ratio.median())
by = df[(df.year>=2010)&(df.year<=2025)].groupby('year').agg(n=('appid','size'), hit=('hit','mean'), hits=('hit','sum'), zh=('zh','mean'), price=('price','median'))
print(by.round(3))
df['pb'] = pd.cut(df.price, [-0.01,0,4.99,9.99,19.99,29.99,1e4], labels=['Free','<$5','$5-10','$10-20','$20-30','$30+'])
d = df[(df.year>=2018)&(df.year<=2025)]
print(d.groupby('pb',observed=True).agg(n=('appid','size'), hit=('hit','mean'), med_rev=('reviews','median')).round(3))
print(d[d.reviews>=10].groupby('pb',observed=True).pos_ratio.median().round(3))
# feature associations among 2018-2025 paid games
p = d[d.price>0].copy()
p['ach'] = p.achievements>0
p['multi'] = p.cats.map(lambda c: 'Multi-player' in c)
p['ctrl'] = p.cats.map(lambda c: any('controller' in x.lower() for x in c))
p['lang_b'] = pd.cut(p.n_langs,[-1,1,4,9,100],labels=['1','2-4','5-9','10+'])
for f in ['zh','ach','multi','ctrl','has_movie','mac','lang_b']:
    print(f, p.groupby(f, observed=True).hit.agg(['mean','size']).round(3).to_dict())
print('dev count:', d.explode('devs').devs.nunique())
