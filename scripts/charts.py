import sys, pandas as pd, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter, FuncFormatter
pkl, tags_csv, out = sys.argv[1:4]
plt.rcParams.update({'font.family':['Microsoft YaHei','sans-serif'],'axes.unicode_minus':False,'figure.facecolor':'#fcfcfb','axes.facecolor':'#fcfcfb',
 'axes.edgecolor':'#c3c2b7','axes.labelcolor':'#52514e','xtick.color':'#52514e','ytick.color':'#52514e','axes.spines.top':False,'axes.spines.right':False,
 'axes.grid':True,'grid.color':'#ebeae6','grid.linewidth':0.8,'axes.axisbelow':True,'font.size':10})
B, O, MUTED, INK = '#2a78d6', '#eb6834', '#b9b8b0', '#0b0b0b'
df = pd.read_pickle(pkl)
df['list_price'] = np.where(df.discount.between(1,99), df.price/(1-df.discount/100), df.price)
df['hit'] = df.reviews>=500
def title(ax, t, sub): ax.set_title(t+'\n', loc='left', fontsize=13, color=INK, fontweight='bold'); ax.text(0,1.02,sub,transform=ax.transAxes,color='#52514e',fontsize=9.5)
def save(fig, name): fig.tight_layout(); fig.savefig(f'{out}/{name}.png', dpi=150); plt.close(fig)

# 1 releases per year
y = df[(df.year>=2010)&(df.year<=2025)].groupby('year').size()
fig, ax = plt.subplots(figsize=(8,4.2))
ax.bar(y.index, y.values, color=B, width=0.72)
for x,v in y.items():
    if x in (2014,2020,2025): ax.text(x, v+400, f'{v:,}', ha='center', fontsize=9, color=INK)
ax.yaxis.set_major_formatter(FuncFormatter(lambda v,_: f'{v/1000:.0f}k')); ax.grid(axis='x', visible=False)
title(ax, '每年新发行游戏数', '2010–2025，2025 年发行量是 2020 年的近 3 倍')
save(fig,'1_releases_per_year')

# 2 review distribution
bins=[-1,0,9,49,499,4999,np.inf]; lab=['0','1–9','10–49','50–499','500–4,999','5,000+']
s = pd.cut(df.reviews,bins,labels=lab).value_counts(normalize=True).reindex(lab)
fig, ax = plt.subplots(figsize=(8,4.2))
ax.bar(lab, s.values, color=[MUTED,MUTED,MUTED,MUTED,B,B], width=0.68)
for i,v in enumerate(s.values): ax.text(i, v+0.006, f'{v:.0%}', ha='center', fontsize=9.5, color=INK)
ax.yaxis.set_major_formatter(PercentFormatter(1,0)); ax.set_xlabel('Steam 评价数'); ax.grid(axis='x', visible=False)
title(ax, '大部分游戏几乎没有评价', '全部 125,855 款游戏；34% 零评价，只有 8% 超过 500 条（蓝色）')
save(fig,'2_review_distribution')

d = df[(df.year>=2018)&(df.year<=2024)].copy()
def hitbar(ax, cats, vals, ns, base):
    ax.bar(cats, vals, color=B, width=0.62)
    for i,(v,n) in enumerate(zip(vals,ns)): ax.text(i, v+0.006, f'{v:.0%}', ha='center', fontsize=9.5, color=INK); ax.text(i, -0.035, f'n={n:,}', ha='center', fontsize=8, color='#52514e')
    ax.axhline(base, color='#52514e', lw=1, ls=(0,(4,3))); ax.text(-0.45, base+0.006, f'整体 {base:.0%}', ha='left', fontsize=8.5, color='#52514e')
    ax.yaxis.set_major_formatter(PercentFormatter(1,0)); ax.set_ylim(-0.05, max(vals)*1.18); ax.set_yticks([v for v in ax.get_yticks() if 0<=v<=max(vals)*1.18]); ax.grid(axis='x', visible=False); ax.tick_params(axis='x', pad=12, length=0)
base = d.hit.mean()
# 3 price
d['pb']=pd.cut(d.list_price,[-0.01,0,4.99,9.99,19.99,29.99,1e4],labels=['免费','<$5','$5–10','$10–20','$20–30','$30+'])
g=d.groupby('pb',observed=True).hit.agg(['mean','size'])
fig, ax = plt.subplots(figsize=(8,4.4)); hitbar(ax, list(g.index), g['mean'].values, g['size'].values, base)
title(ax,'定价越高，"有一定成功"的比例越高','2018–2024 发行；成功 = ≥500 条评价；按原价（非折后价）分组')
save(fig,'3_hit_by_price')
# 4 languages
d['lb']=pd.cut(d.n_langs,[-1,1,4,9,100],labels=['1 种','2–4 种','5–9 种','10+ 种'])
g=d.groupby('lb',observed=True).hit.agg(['mean','size'])
fig, ax = plt.subplots(figsize=(8,4.4)); hitbar(ax, list(g.index), g['mean'].values, g['size'].values, base)
title(ax,'支持语言越多，成功率越高','2018–2024 发行；按界面支持语言数量分组（相关，非因果）')
save(fig,'4_hit_by_languages')

# 5 tag scatter
t = pd.read_csv(tags_csv, index_col=0)
outcome = {'Great Soundtrack','Classic','Beautiful','Masterpiece','Memes','Mature','Addictive','Moddable','Cult Classic','Replay Value','Funny','Atmospheric','Difficult','Psychological','Epic','Story Rich','Lore-Rich','Hentai','NSFW','Nudity','Sexual Content','Blood','Gore','Violent','Free to Play','Early Access','Indie','Singleplayer'}
t = t[~t.index.isin(outcome)]
fig, ax = plt.subplots(figsize=(9.5,6.2))
ax.scatter(t.n, t.hit, s=22, color=MUTED, edgecolor='#fcfcfb', linewidth=1, zorder=2)
opp = ['Cozy','Wholesome','Narrative','Roguelike Deckbuilder','Colony Sim','Open World Survival Craft','Online Co-Op','Turn-Based','City Builder','Base-Building']
crowd = ['2D Platformer','Arcade','Casual','Linear','Puzzle','Pixel Graphics']
for names,c in ((opp,B),(crowd,O)):
    s=t.loc[[n for n in names if n in t.index]]
    ax.scatter(s.n, s.hit, s=48, color=c, edgecolor='#fcfcfb', linewidth=2, zorder=3)
    for n,r in s.iterrows(): ax.annotate(n,(r.n,r.hit),xytext={'Colony Sim':(6,-12),'Puzzle':(6,-12),'Linear':(-6,-12)}.get(n,(6,3)),ha='right' if n=='Linear' else 'left',textcoords='offset points',fontsize=8.5,color=INK)
b = 0.098; ax.axhline(b,color='#52514e',lw=1,ls=(0,(4,3))); ax.text(t.n.max(), b+0.005, f'基准 {b:.1%}', ha='right', fontsize=8.5, color='#52514e')
ax.set_xscale('log'); ax.xaxis.set_major_formatter(FuncFormatter(lambda v,_: f'{int(v):,}'))
ax.yaxis.set_major_formatter(PercentFormatter(1,0)); ax.set_xlabel('该标签的游戏数（供给，对数轴）'); ax.set_ylabel('成功率（≥500 评价）')
title(ax,'标签地图：供给 vs 成功率','2018–2024 发行、≥300 款游戏的标签；蓝 = 机会候选，橙 = 拥挤且成功率低；已剔除"好评结果型"标签')
save(fig,'5_tag_map')
print('ok')
