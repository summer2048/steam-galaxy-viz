import sys, pandas as pd, numpy as np
pd.set_option('display.width',220); pd.set_option('display.max_rows',200)
df = pd.read_pickle(sys.argv[1])
print(df.discount.describe())
df['list_price'] = np.where(df.discount.between(1,99), df.price/(1-df.discount/100), df.price).round(2)
df['hit'] = df.reviews>=500
d = df[(df.year>=2018)&(df.year<=2025)].copy()
d['pb'] = pd.cut(d.list_price, [-0.01,0,4.99,9.99,19.99,29.99,1e4], labels=['Free','<$5','$5-10','$10-20','$20-30','$30+'])
print(d.groupby('pb',observed=True).agg(n=('appid','size'), hit=('hit','mean')).round(3))
print(d[d.reviews>=10].groupby('pb',observed=True).pos_ratio.median().round(3))
print('share with tags', (d.tags.map(len)>0).mean())
w = df[(df.year>=2018)&(df.year<=2024)&(df.tags.map(len)>0)]
e = w[['appid','year','tags','hit','reviews','pos_ratio','list_price','med_play']].explode('tags')
g = e.groupby('tags').agg(n=('appid','size'), hit=('hit','mean'), med_rev=('reviews','median'),
    recent=('year', lambda y: (y>=2022).mean()), price=('list_price','median'))
g['score'] = e[e.reviews>=20].groupby('tags').pos_ratio.median()
g = g[g.n>=300]
base_hit = w.hit.mean(); print('baseline hit (tagged, 2018-24):', round(base_hit,3), 'n', len(w))
g['lift'] = g.hit/base_hit
print(len(g),'tags')
print(g.sort_values('hit',ascending=False).head(40).round(3))
print(g.sort_values('n',ascending=False).head(25).round(3))
# opportunity: supply below median, hit lift high
med_n = g.n.median()
opp = g[(g.n<=med_n)].sort_values('hit',ascending=False).head(25)
print('median n', med_n); print(opp.round(3))
g.to_csv(sys.argv[2])
