import sys, ast, re, pandas as pd, numpy as np
src, out = sys.argv[1], sys.argv[2]
raw = pd.read_csv(src, index_col=False, header=None, skiprows=1, low_memory=False)
m = {0:'appid',1:'name',2:'release_date',3:'owners',4:'peak_ccu',5:'age',6:'price',7:'discount',8:'dlc',
     10:'langs',11:'audio_langs',13:'img',17:'win',18:'mac',19:'linux',20:'metacritic',22:'user_score',23:'pos',24:'neg',
     26:'achievements',27:'recs',29:'avg_play',31:'med_play',33:'devs',34:'pubs',35:'cats',36:'genres',37:'tags',38:'screens',39:'movies'}
df = raw[list(m)].rename(columns=m)
num = ['peak_ccu','age','price','discount','dlc','metacritic','user_score','pos','neg','achievements','recs','avg_play','med_play']
for c in num: df[c] = pd.to_numeric(df[c], errors='coerce')
df['date'] = pd.to_datetime(df.release_date, format='mixed', errors='coerce')
df['year'] = df.date.dt.year
lo_hi = df.owners.astype(str).str.extract(r'(\d+)\s*-\s*(\d+)').astype(float)
df['owners_lo'], df['owners_hi'] = lo_hi[0], lo_hi[1]
df['reviews'] = df.pos.fillna(0) + df.neg.fillna(0)
df['pos_ratio'] = np.where(df.reviews > 0, df.pos / df.reviews.replace(0, np.nan), np.nan)
def lst(s):
    if not isinstance(s, str) or not s.strip(): return []
    return [x.strip() for x in s.split(',') if x.strip()]
for c in ['tags','genres','cats']: df[c] = df[c].map(lst)
# company names may contain ", " (e.g. "Kabam Games, Inc."); list separators have no trailing space
def companies(s):
    if not isinstance(s, str) or not s.strip(): return []
    return [x.strip() for x in re.split(r',(?=\S)', s) if x.strip()]
for c in ['devs','pubs']: df[c] = df[c].map(companies)
def lang(s):
    try: return ast.literal_eval(s) if isinstance(s,str) else []
    except Exception: return []
df['langs'] = df.langs.map(lang)
df['n_langs'] = df.langs.map(len)
df['zh'] = df.langs.map(lambda l: any('Chinese' in x for x in l))
df['n_screens'] = df.screens.map(lambda s: s.count(',')+1 if isinstance(s,str) and s.strip() else 0)
df['has_movie'] = df.movies.notna()
df = df.drop(columns=['screens','movies','release_date','owners'])
df = df.drop_duplicates('appid')
print(df.shape, df.date.isna().sum(), 'no date'); print(df.year.value_counts().sort_index().tail(8))
print('max date', df.date.max())
df.to_pickle(out)
