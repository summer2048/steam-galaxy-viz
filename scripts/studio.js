/* Studio: task views on top of the per-game table (GameDB). Runs after the main page script and reuses its helpers
   (tx, w, esc, fmt, pct, showTip, hideTip, row, note, famOf, famColor, assetB64, state, T, lock). */
const Studio = (() => {
  const DEFS = { r: 'hit', o: 'hit_o', g: 'hit_g' };
  const DEF_TXT = {
    r: tx('拿到 500+ 条评价', 'reach 500+ reviews'), o: tx('持有量区间上限达到 20 万+', 'reach 200k+ owners (top of the owner band)'), g: tx('按上限估算的流水达到 $100 万+', 'gross an estimated $1M+ (upper bound: owner band top × list price)'),
  };
  const PRESETS = [['Card Game'], ['Deckbuilding', 'Rogue-lite'], ['Cozy', 'Farming Sim'], ['Survival', 'Open World'], ['Puzzle'], ['Visual Novel']];
  const S = { open: false, mode: 'dev', view: 'lane', combo: ['Card Game'], sm: 'r' };
  let DB = null, root = null, tagList = null, opener = null;
  const DB_TAG_OK = t => !!T[t];

  const $ = id => document.getElementById(id);
  const def = () => DEFS[S.sm];
  const times = v => v == null || !isFinite(v) ? '—' : (v >= 10 ? v.toFixed(0) : v.toFixed(v >= 1 ? 2 : 2)) + '×';
  const pc = (v, d = 1) => v == null ? '—' : (v * 100).toFixed(v < .01 && v > 0 ? 2 : d) + '%';
  const medianOf = v => !v.length ? null : v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;   // v sorted
  const tagColor = t => T[t] ? famColor(famOf(t)) : 'var(--fam-other)';
  const coverSrc = i => i == null ? null : 'data:image/webp;base64,' + assetB64(i);
  // embedded cover if the map has one; otherwise covers/<appid>.webp shipped next to the page; the name shows if neither loads
  const coverHtml = g => g.i != null ? `<img src="${coverSrc(g.i)}" alt="" loading="lazy">`
    : `<div class="ph">${esc(g.n)}</div><img src="covers/${g.appid}.webp" alt="" loading="lazy" onerror="this.remove()">`;

  function db() {
    if (!DB) DB = GameDB.open(JSON.parse($('gamesRaw').textContent));
    if (!tagList) {
      const out = new Set(DB.tags.filter(t => T[t] && T[t].outcome));
      tagList = DB.tags.filter(t => !out.has(t) && DB.withTags([t]).length >= 30).sort((a, b) => a.localeCompare(b));
    }
    return DB;
  }

  // ---------- shell ----------
  function build() {
    root = document.createElement('div'); root.id = 'studio'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Studio');
    root.innerHTML = `<header class="st-top">
        <button class="st-btn" id="stBack" type="button">← ${tx('返回星图', 'Back to the map')}</button>
        <div class="st-brand"><span class="kicker">${tx('Steam 标签地图', 'Steam tag map')}</span><b>Studio</b></div>
        <div class="st-seg" id="stMode" role="group" aria-label="${tx('模式', 'Mode')}">
          <button type="button" data-m="dev">${tx('我在做游戏', "I'm making a game")}</button>
          <button type="button" data-m="player">${tx('我在找游戏玩', "I'm looking for a game")}</button></div>
        <div><span class="st-seg-l">${tx('成功 =', 'Success =')}</span><div class="st-seg" id="stSM" role="group">${SM.map(m => `<button type="button" data-k="${m.k}" title="${esc(m.s)}">${m.t}</button>`).join('')}</div></div>
      </header>
      <div class="st-wrap"><nav class="st-steps" id="stSteps"></nav><div id="stBody"></div></div>
      <datalist id="stTags"></datalist>`;
    document.body.appendChild(root);
    $('stBack').onclick = close;
    $('stMode').onclick = e => { const b = e.target.closest('button[data-m]'); if (b && !b.disabled) { S.mode = b.dataset.m; render(); } };
    $('stSM').onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { S.sm = b.dataset.k; render(); } };
    $('stSteps').onclick = e => { const b = e.target.closest('button[data-v]'); if (b && !b.disabled) { S.view = b.dataset.v; render(); root.scrollTop = 0; } };
    root.addEventListener('scroll', hideTip, { passive: true });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('input')) close(); });
  }
  function open(opts = {}) {
    if (!root) build();
    if (opts.combo) S.combo = opts.combo.slice();
    if (opts.add && !S.combo.includes(opts.add)) S.combo.push(opts.add);
    if (opts.view === 'player') S.mode = 'player'; else if (opts.view) { S.view = opts.view; S.mode = 'dev'; }
    S.sm = opts.sm && DEFS[opts.sm] ? opts.sm : state.sm; S.open = true;
    if (!root.contains(document.activeElement)) opener = document.activeElement;
    document.body.classList.add('studio-open'); hideTip();
    if ('ptag' in opts) S.ptag = opts.ptag && DB_TAG_OK(opts.ptag) ? opts.ptag : null;
    const go = () => { if (opts.seedAppids) S.seeds = opts.seedAppids.map(rowOfAppid).filter(r => r != null); if (opts.seedCover != null) { const r = rowOfCover(opts.seedCover); S.seeds = r == null ? [] : [r]; } S.pick = null; render(); };
    if (!DB) { $('stBody').innerHTML = `<div class="st-loading">${tx('正在载入 83,353 款游戏…', 'Loading 83,353 games…')}</div>`; setTimeout(() => { db(); if (S.open) go(); }, 30); }
    else go();
    root.focus && root.setAttribute('tabindex', '-1'); root.focus();
  }
  function close() {
    S.open = false; document.body.classList.remove('studio-open'); hideTip();
    if (location.hash.startsWith('#studio')) history.replaceState(null, '', location.pathname + location.search);
    if (opener && opener.isConnected && opener.focus) opener.focus();
    opener = null;
  }
  function syncHash() { if (S.open) history.replaceState(null, '', S.mode === 'player' ? `#studio/player/${S.seeds.map(r => DB.col.appid[r]).join('+')}/${S.sm}${S.ptag ? '/' + encodeURIComponent(S.ptag) : ''}` : `#studio/${S.view}/${S.combo.map(encodeURIComponent).join('+')}/${S.sm}`); }

  function render() {
    if (!DB) return;
    $('stMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
    $('stSM').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === S.sm));
    const steps = [['lane', tx('选赛道', 'Pick a lane')], ['plan', tx('比较方案', 'Compare plans')]];
    $('stSteps').innerHTML = steps.map(([v, t], i) => `<button type="button" data-v="${v}" class="${S.view === v ? 'on' : ''}" ><i>${i + 1}</i>${t}</button>`).join('');
    $('stTags').innerHTML = tagList.filter(t => !S.combo.includes(t)).map(t => `<option value="${esc(t)}">`).join('');
    syncHash();
    $('stSteps').style.display = S.mode === 'player' ? 'none' : '';
    $('stSM').parentElement.style.display = S.mode === 'player' ? 'none' : '';   // success is a developer notion
    if (S.mode === 'player') renderPlayer(); else if (S.view === 'plan') renderPlan(); else renderLane();
  }

  // ---------- step 1: pick a lane ----------
  function comboBar() {
    return `<div class="st-combo"><span class="lab">${tx('组合', 'Combo')}</span>
      ${S.combo.map(t => `<span class="st-chip" style="--fc:${tagColor(t)}">${esc(t)}<button type="button" data-rm="${esc(t)}" aria-label="${tx('移除', 'Remove')} ${esc(t)}">×</button></span>`).join('')}
      <input id="stAdd" list="stTags" placeholder="${S.combo.length ? tx('+ 再加一个标签', '+ add another tag') : tx('输入一个标签，例如 Card Game', 'Type a tag, e.g. Card Game')}" aria-label="${tx('添加标签', 'Add a tag')}"></div>
      <div class="st-presets">${tx('试试：', 'Try:')} ${PRESETS.map(p => `<button type="button" data-preset="${esc(p.join('|'))}">${esc(p.join(' + '))}</button>`).join('')}</div>`;
  }
  // Two separate judgements, so performance and crowding never contradict each other or the chart.
  const CROWDED = .01;   // >= 1% of a year's new releases (about 125+ games in 2024); the same split as the lane map
  function verdictOf(L) {
    const { all, years, growth } = L, last = years[years.length - 1];
    const perf = all.n < 40 || all.O < 5 ? ['thin', tx('样本太少，难下结论', 'Too few games to judge')]
      : all.hi < 1 ? ['red', tx('低于大盘', 'Below the market')]
      : all.lo > 1 ? ['blue', tx('跑赢大盘', 'Beats the market')] : ['flat', tx('和大盘差不多', 'About the market')];
    // level (share of 2024 releases) plus direction (2022–24 vs 2018–20 average share), so a growing lane never reads as settled
    const dir = growth >= 2 ? tx('快速变挤', 'filling up fast') : growth >= 1.25 ? tx('在变挤', 'getting busier') : growth <= .8 ? tx('在变空', 'thinning out') : tx('稳定', 'steady');
    const crowd = last.share >= CROWDED ? ['red', tx(`拥挤 · ${dir}`, `Crowded · ${dir}`)]
      : [growth >= 1.25 ? 'fill' : 'blue', tx(`不挤 · ${dir}`, `Uncrowded · ${dir}`)];
    return [perf, crowd];
  }
  function laneData(tags) {
    const d = DB, k = def(), rows = d.withTags(tags), scope = d.filter(rows, d.inScope);
    const all = d.oe(rows, k), years = d.laneYears(rows, k), early = d.oe(rows, k, [2018, 2020]), late = d.oe(rows, k, [2022, 2024]);
    const avg = a => a.reduce((s, y) => s + y.share, 0) / a.length;
    const growth = avg(years.slice(-3)) / Math.max(1e-9, avg(years.slice(0, 3)));
    return { tags, rows, scope, all, years, early, late, growth, raw: d.rate(scope, k).rate, comp: d.companions(rows, tags, k) };
  }

  function renderLane() {
    const body = $('stBody');
    if (!S.combo.length) { body.innerHTML = comboBar() + `<div class="st-empty">${tx('先选一个标签，看看它的赛道。', 'Pick a tag to see its lane.')}</div>`; wireLane(); $('stAdd').focus(); return; }
    const L = laneData(S.combo), [[pk, pt], [ck, ct]] = verdictOf(L), y0 = L.years[0], y1 = L.years[L.years.length - 1];
    const name = S.combo.map(esc).join('<span class="plus">+</span>');
    const lede = L.all.n === 0 ? tx('2018–2024 年没有同时带这些标签的游戏。', 'No game released 2018–2024 carries all of these tags.') : tx(
      `2018–2024 年共 <b>${fmt(L.all.n)}</b> 款。按发行年份校正后，它们${DEF_TXT[S.sm]}的机会是大盘的 <b>${times(L.all.ratio)}</b>（95% 区间 ${times(L.all.lo)}–${times(L.all.hi)}）。在新游戏里的占比从 2018 年的 <b>${pc(y0.share, 2)}</b> 变成 2024 年的 <b>${pc(y1.share, 2)}</b>，优势从 <b>${times(L.early.ratio)}</b>（2018–20）变为 <b>${times(L.late.ratio)}</b>（2022–24）。`,
      `<b>${fmt(L.all.n)}</b> games came out 2018–2024. Adjusted for release year, they ${DEF_TXT[S.sm]} <b>${times(L.all.ratio)}</b> as often as the average Steam game (95% range ${times(L.all.lo)}–${times(L.all.hi)}). Their share of new releases went from <b>${pc(y0.share, 2)}</b> in 2018 to <b>${pc(y1.share, 2)}</b> in 2024, and the edge moved from <b>${times(L.early.ratio)}</b> (2018–20) to <b>${times(L.late.ratio)}</b> (2022–24).`);
    const kpi = (k, v, d, cls = '') => `<div class="st-kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    body.innerHTML = comboBar() + `
      <section class="st-hero"><div>
          <span class="st-verdict ${pk}"><i></i>${pt}</span> <span class="st-verdict ${ck}"><i></i>${ct}</span>
          <h1>${name}</h1><p class="st-lede">${lede}</p></div>
        <div class="st-kpis">
          ${kpi(tx('成功率 vs 大盘（按年份校正）', 'Success vs the market (year-adjusted)'), times(L.all.ratio), tx(`95% 区间 ${times(L.all.lo)}–${times(L.all.hi)} · 1× = 大盘`, `95% range ${times(L.all.lo)}–${times(L.all.hi)} · 1× = market`), 'big')}
          ${kpi(tx('游戏数 2018–24', 'Games 2018–24'), fmt(L.all.n), tx(`其中 ${fmt(L.all.O)} 款成功`, `${fmt(L.all.O)} succeeded`))}
          ${kpi(tx('原始成功率', 'Raw success rate'), pc(L.raw), tx(`大盘 ${pc(succ(B, S.sm))}`, `market ${pc(succ(B, S.sm))}`))}
          ${kpi(tx('2024 年新作占比', 'Share of 2024 releases'), pc(y1.share, 2), y0.share ? tx(`2018 年 ${pc(y0.share, 2)} → ×${(y1.share / y0.share).toFixed(1)}`, `2018: ${pc(y0.share, 2)} → ×${(y1.share / y0.share).toFixed(1)}`) : tx('2018 年还没有这类游戏', 'none released in 2018'))}
          ${kpi(tx('2024 年对手', 'Rivals in 2024'), fmt(y1.n), tx('同年发行的同赛道游戏', 'same-lane games released that year'))}
        </div></section>
      <div class="st-grid2">
        <section class="st-card"><h3>${tx('再加一个标签，会落在哪？', 'Add one more tag: where does it land?')}</h3>
          <p class="cap">${tx('每个点 = 当前组合 + 一个常见搭配标签。组合越窄游戏越少，所以点都在圆圈左边；要看的是<b>落得多高</b>（成功率，2018–24，按年份校正）。点击加入组合。', 'Each dot is this combo plus one tag it often appears with. A narrower combo always has fewer games, so every dot sits left of the ring; the question is <b>how high it lands</b> (success, 2018–24, year-adjusted). Click a dot to add it.')}</p>
          <div id="stMap"></div></section>
        <section class="st-card"><h3>${tx('它在变挤吗？', 'Is it getting crowded?')}</h3>
          <p class="cap">${tx('柱 = 当年新作中的占比；线 = 当年成功率 vs 大盘，阴影是 95% 区间，游戏少的年份区间更宽。', 'Bars: share of that year\'s new releases. Line: success vs the market that year, with its 95% range shaded; years with few games get wide ranges.')}</p>
          <div id="stTrend"></div></section>
      </div>
      <section class="st-card"><div class="st-hd"><h3>${tx('缩小范围：当前组合 + 一个标签', 'Narrow it down: this combo + one more tag')}</h3>
        <p class="cap">${tx('每组按 95% 区间下限排序，样本少的组合不会因为运气排到前面。', 'Each group is ranked by the low end of its 95% range, so small lucky combos do not jump the queue.')}</p></div>
        <div id="stComp"></div></section>
      <section class="st-card"><h3>${tx('这条赛道里被看见的游戏', 'The games that made it in this lane')}</h3>
        <p class="cap">${tx('2018–2024 发行，按评价数排序。', 'Released 2018–2024, by number of reviews.')}</p><div class="st-games" id="stGames"></div></section>
      <div class="st-next"><button class="st-btn pri" type="button" data-go-plan="1">${tx('用这个组合做方案 →', 'Plan a game in this lane →')}</button></div>
      <p class="st-foot">${tx('“按年份校正”：每款游戏和同年发行的全部有标签游戏比较，因为新游戏还没来得及攒评价。所有结果都是相关，不是因果；热门游戏的标签更多，所以细分组合的数值整体偏高，看相对排序更可靠。', '“Year-adjusted”: each game is compared with every tagged game released the same year, because newer games have had less time to collect reviews. Everything here is correlation, not cause. Popular games carry more tags, so narrow combos read high overall; the ranking is more reliable than the absolute value.')}</p>`;
    drawLaneMap(L); drawTrend(L); drawComp(L); drawGames(L);
    wireLane();
  }
  function wireLane() {
    const body = $('stBody');
    body.onclick = e => {
      if (e.target.closest('[data-go-plan]')) { S.view = 'plan'; render(); root.scrollTo({ top: 0 }); return; }
      const rm = e.target.closest('[data-rm]'), add = e.target.closest('[data-add]'), pre = e.target.closest('[data-preset]');
      if (rm) { S.combo = S.combo.filter(t => t !== rm.dataset.rm); render(); }
      else if (add) { if (!S.combo.includes(add.dataset.add)) S.combo.push(add.dataset.add); hideTip(); render(); root.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (pre) { S.combo = pre.dataset.preset.split('|'); render(); }
    };
    const inp = $('stAdd');
    const commit = () => { const v = inp.value.trim(), t = tagList.find(x => x.toLowerCase() === v.toLowerCase()); if (t && !S.combo.includes(t)) { S.combo.push(t); render(); $('stAdd').focus(); } };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Backspace' && !inp.value && S.combo.length) { S.combo.pop(); render(); $('stAdd').focus(); } });
  }

  // ---------- step 2: compare plans ----------
  const PRICE_T = () => [tx('免费', 'Free'), '<$5', '$5–10', '$10–20', '$20–30', '$30+'];
  const LANG_T = () => [tx('1 种', '1 language'), tx('2–4 种', '2–4 languages'), tx('5–9 种', '5–9 languages'), tx('10+ 种', '10+ languages')];
  const LANG_EX = () => [tx('通常只有英文', 'usually English only'), tx('如 英/中/日', 'e.g. EN, ZH, JA'), tx('主流欧亚语言', 'major EU + Asian'), tx('几乎全覆盖', 'near-global')];
  const PLAN_COL = ['var(--s1)', 'var(--accent)', 'var(--fam2)'];
  S.plans = [{ name: 'A', price: 3, lt: 1 }, { name: 'B', price: 2, lt: 0 }];
  S.active = 0;
  const pTier = r => DB.bucketOf('price', DB.price[r]), lTier = r => DB.col.nlang[r] ? DB.bucketOf('lang', DB.col.nlang[r]) : -1;   // games listing no language join no tier
  const planPred = p => r => pTier(r) === p.price && lTier(r) === p.lt;
  const SPARSE = 30;
  function renderPlan() {
    const body = $('stBody');
    if (!S.combo.length) { body.innerHTML = `<div class="st-empty">${tx('先在第 1 步选一条赛道。', 'Pick a lane in step 1 first.')}</div>`; return; }
    const rows = DB.withTags(S.combo), k = def(), pl = S.plans[S.active];
    const est = S.plans.map(p => DB.cohort(rows, planPred(p), k)), lane = DB.cohort(rows, null, k), mk = DB.marketFor(rows, k);
    const boot = DB.cohortBoot(rows, [null, ...S.plans.map(planPred)], k);
    const iv = q => DB.interval(boot, x => x[q]);
    // what if the active plan changed one thing: price with its languages held, languages with its price held.
    // One paired bootstrap covers the plan and every alternative, so whiskers and suggested gains share one method.
    const altP = PRICE_T().map((t, j) => r => pTier(r) === j && lTier(r) === pl.lt), altL = LANG_T().map((t, j) => r => pTier(r) === pl.price && lTier(r) === j);
    const boot2 = DB.cohortBoot(rows, [planPred(pl), ...altP, ...altL], k, 10, rows.length > 8000 ? 150 : 300);
    const alt = (t, j, q, pred) => { const c = DB.cohort(rows, pred, k), [lo, hi] = DB.interval(boot2, x => x[q]), [dlo, dhi] = DB.interval(boot2, x => x[q] - x[0]); return { t, j, ...c, lo, hi, dlo, dhi }; };
    const ifPrice = PRICE_T().map((t, j) => alt(t, j, 1 + j, altP[j]));
    const ifLang = LANG_T().map((t, j) => alt(t, j, 1 + PRICE_T().length + j, altL[j]));
    const name = S.combo.map(esc).join(' + ');
    body.innerHTML = `
      <div class="st-plan">
        <aside class="st-card st-editor">
          <div class="st-tabs" role="tablist">${S.plans.map((p, i) => `<button type="button" role="tab" data-plan="${i}" class="${i === S.active ? 'on' : ''}" style="--pc:${PLAN_COL[i]}"><i></i>${tx('方案', 'Plan')} ${p.name}<small>${est[i].n ? pc(est[i].rate, 0) : '—'}</small></button>`).join('')}
            ${S.plans.length < 3 ? `<button type="button" data-plan="new" class="new">+ ${tx('新方案', 'New')}</button>` : `<button type="button" data-plan="del" class="new" title="${tx('删除当前方案', 'Delete this plan')}">− ${tx('删除', 'Delete')}</button>`}</div>
          <div class="st-f"><div class="st-fl">${tx('赛道', 'Lane')}</div><div class="st-lane">${S.combo.map(t => `<span class="st-chip" style="--fc:${tagColor(t)}">${esc(t)}</span>`).join('')}<button type="button" class="st-link" data-go="lane">${tx('修改', 'Change')}</button></div></div>
          <div class="st-f"><div class="st-fl">${tx('价格', 'Price')}</div><div class="st-pills">${PRICE_T().map((t, j) => `<button type="button" data-price="${j}" class="${pl.price === j ? 'on' : ''}">${t}</button>`).join('')}</div></div>
          <div class="st-f"><div class="st-fl">${tx('支持几种语言', 'How many languages')}</div><div class="st-pills col">${LANG_T().map((t, j) => `<button type="button" data-lt="${j}" class="${pl.lt === j ? 'on' : ''}">${t}<small>${LANG_EX()[j]}</small></button>`).join('')}</div></div>
          <p class="st-note">${tx('只比较价格档和语言数：具体哪几种语言、游戏时长、发售年份都不参与计算。只有约 20% 的游戏有时长数据，而且这些游戏的成功率远高于平均（46% 对约 1%）；未来年份没有数据。', 'Only price tier and number of languages are compared. Which languages, playtime and launch year are left out: only about 20% of games have playtime data, and those are far more successful than average (46% vs about 1%), and future years have no data.')}</p>
        </aside>
        <div class="st-main">
          <section class="st-card"><div class="st-hd"><h3>${tx('成功的机会', 'Chance of success')}</h3>
            <p class="cap">${tx(`<b>估计值</b>：过去 ${name} 里价格档和语言数都相同的游戏有多少${DEF_TXT[S.sm]}，逐年计算并按发行年份校正，样本少时向当年赛道均值收缩。横线 = 95% 区间（自助法）。右侧小字是实际观察到的成功数。`, `<b>Estimate</b>: how often past ${name} games with the same price tier and number of languages ${DEF_TXT[S.sm]}, computed per release year and pulled toward that year's lane average when thin. Bars are 95% ranges (bootstrap). The small print on the right is what was actually observed.`)}</p></div>
            <div id="stOdds"></div><div id="stDiff" class="st-callout"></div></section>
          <section class="st-card"><div class="st-hd"><h3>${tx(`如果方案 ${pl.name} 只改一件事`, `What if Plan ${pl.name} changed one thing?`)}</h3>
            <p class="cap">${tx(`左：语言数不变（${LANG_T()[pl.lt]}），只改价格。右：价格不变（${PRICE_T()[pl.price]}），只改语言数。高亮 = 方案 ${pl.name} 现在的位置；少于 30 款的档位颜色变浅。`, `Left: keep ${LANG_T()[pl.lt]}, change only the price. Right: keep ${PRICE_T()[pl.price]}, change only the number of languages. Highlighted = where Plan ${pl.name} is now; tiers with fewer than 30 games are faded.`)}</p></div>
            <div class="st-grid2 tight"><div id="stPriceB"></div><div id="stLangB"></div></div><div id="stHint" class="st-callout"></div></section>
          <section class="st-card"><h3>${tx(`和方案 ${pl.name} 最像的游戏`, `Games most like Plan ${pl.name}`)}</h3>
            <p class="cap">${tx('同一赛道、2018–2024 发行，赛道标签排得越靠前、价格和语言越接近，排名越高。成功和没成功的各看几款。', 'Same lane, released 2018–2024, ranked by how prominently they carry the lane tags and how close their price and languages are. Some that made it, some that did not.')}</p>
            <div class="st-sub" style="margin-top:0">${tx('成功了', 'Made it')}</div><div class="st-games" id="stSimHit"></div>
            <div class="st-sub">${tx('没成功', 'Did not')}</div><div class="st-games" id="stSimMiss"></div></section>
          ${S.sm === 'g' ? `<p class="st-foot">${tx('注意：“流水 ≥ $100 万”按定义就和价格有关，价格越高，需要的持有量越少，所以价格档的差异会被放大。', 'Note: “Gross ≥ $1M” depends on price by definition (a higher price needs fewer owners to qualify), so it exaggerates price differences.')}</p>` : ''}
        </div></div>`;
    drawOdds(est, lane, mk, iv); drawDiff(est, boot);
    drawTiers('stPriceB', tx('价格档', 'Price tier'), ifPrice, pl.price); drawTiers('stLangB', tx('语言数', 'Number of languages'), ifLang, pl.lt);
    drawHint(ifPrice, ifLang, est[S.active]); drawSimilar(rows, pl);
    body.onclick = e => {
      const t = e.target.closest('[data-plan],[data-price],[data-lt],[data-go]'); if (!t) return;
      if (t.dataset.go) { S.view = t.dataset.go; render(); return; }
      if (t.dataset.price != null) { pl.price = +t.dataset.price; renderPlan(); return; }
      if (t.dataset.lt != null) { pl.lt = +t.dataset.lt; renderPlan(); return; }
      const v = t.dataset.plan;
      if (v === 'new') { S.plans.push({ ...pl, name: 'ABC'[S.plans.length] }); S.active = S.plans.length - 1; }
      else if (v === 'del') { S.plans.splice(S.active, 1); S.plans.forEach((p, i) => p.name = 'ABC'[i]); S.active = Math.min(S.active, S.plans.length - 1); }
      else S.active = +v;
      renderPlan();
    };
  }
  function drawOdds(est, lane, mk, iv) {
    const R = [...S.plans.map((p, i) => { const [lo, hi] = iv(i + 1);
        return { lab: `${tx('方案', 'Plan')} ${p.name}`, sub: `${PRICE_T()[p.price]} · ${LANG_T()[p.lt]}`, col: PLAN_COL[i], ...est[i], lo, hi, plan: true, on: i === S.active }; }),
      (() => { const [lo, hi] = iv(0); return { lab: tx('整条赛道', 'Whole lane'), sub: S.combo.join(' + '), col: 'var(--ink2)', ...lane, lo, hi }; })(),
      { lab: tx('Steam 大盘', 'All of Steam'), sub: tx('同样的年份结构', 'same year mix'), col: 'var(--muted)', rate: mk, lo: null, hi: null, n: null }];
    const narrow = $('stOdds').clientWidth < 520;   // phones get a narrower drawing so labels stay readable
    const max = Math.min(1, Math.max(.1, ...R.map(r => r.n === 0 ? 0 : (r.hi ?? r.rate ?? 0))) * 1.12), W = narrow ? 360 : 640, rowH = 48, m = narrow ? { l: 100, r: 108 } : { l: 175, r: 165 }, H = R.length * rowH + 26;
    const X = v => m.l + v / max * (W - m.l - m.r);
    let s = `<svg viewBox="0 0 ${W} ${H}">`;
    for (let v = 0; v <= max + 1e-9; v += max > .5 ? .2 : max > .25 ? .1 : .05) s += `<line x1="${X(v)}" x2="${X(v)}" y1="0" y2="${H - 20}" stroke="var(--grid)"/><text x="${X(v)}" y="${H - 4}" text-anchor="middle">${(v * 100).toFixed(0)}%</text>`;
    R.forEach((r, i) => {
      const y = i * rowH + rowH / 2;
      if (r.on) s += `<rect x="-6" y="${y - rowH / 2 + 3}" width="${W + 6}" height="${rowH - 6}" rx="8" fill="rgba(255,255,255,.035)"/>`;
      s += `<text x="0" y="${y - 2}" class="lbl" style="font-size:13px;fill:${r.plan ? 'var(--ink)' : 'var(--ink2)'}">${esc(r.lab)}</text><text x="0" y="${y + 13}">${esc(r.sub)}</text>`;
      if (r.n === 0) { s += `<text x="${m.l}" y="${y + 4}" class="note">${tx('没有可比的游戏', 'No comparable games')}</text>`; return; }
      if (r.rate == null) return;
      if (r.lo != null) s += `<line x1="${X(r.lo)}" x2="${X(r.hi)}" y1="${y}" y2="${y}" stroke="${r.col}" stroke-width="${r.plan ? 6 : 3}" stroke-linecap="round" opacity=".35"/>`;
      s += `<circle cx="${X(r.rate)}" cy="${y}" r="${r.plan ? 7 : 5}" fill="${r.col}" stroke="var(--surface)" stroke-width="2"/>
        <text x="${W - m.r + 12}" y="${y - 1}" class="lbl" style="font-size:15px">${pc(r.rate)}${r.plan ? ` <tspan style="font-size:10px;fill:var(--muted);font-weight:400">${tx('估计', 'estimate')}</tspan>` : ''}</text>
        <text x="${W - m.r + 12}" y="${y + 14}">${r.n != null ? tx(`实际 ${fmt(r.hits)}/${fmt(r.n)} 款成功`, `observed ${fmt(r.hits)} of ${fmt(r.n)}`) : ''}${r.plan && r.n < SPARSE ? ' ⚠' : ''}</text>`;
    });
    $('stOdds').innerHTML = s + '</svg>';
  }
  function drawDiff(est, boot) {
    const a = S.active, el = $('stDiff'), others = S.plans.map((_, i) => i).filter(i => i !== a), P = S.plans, pp = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1);
    if (!others.length) { el.innerHTML = ''; return; }
    el.innerHTML = others.map(o => {
      const A = P[a], O = P[o];
      if (!est[a].n || !est[o].n) return tx(`方案 ${A.name} 或 ${O.name} 没有可比的历史游戏，无法比较。`, `Plan ${A.name} or ${O.name} has no comparable past games, so they cannot be compared.`);
      if (A.price === O.price && A.lt === O.lt) return tx(`方案 ${A.name} 和 ${O.name} 落在同一组历史游戏里，数据分不出差别。`, `Plans ${A.name} and ${O.name} fall into the same group of past games, so the data cannot tell them apart.`);
      const d = est[a].rate - est[o].rate, [lo, hi] = DB.interval(boot, x => x[a + 1] - x[o + 1]), sure = lo > 0 || hi < 0;
      const win = d >= 0 ? A.name : O.name, gap = Math.abs(d), warn = est[a].n < SPARSE || est[o].n < SPARSE ? tx('（有一个方案可比的游戏少于 30 款，结论要打折扣）', ' (one plan has fewer than 30 comparable games, so treat this with care)') : '';
      return sure ? tx(`<b>方案 ${win} 更好。</b>${A.name} − ${O.name} = <b>${pp(d)} 个百分点</b>（95% 区间 ${pp(lo)} 到 ${pp(hi)}）${warn}。`, `<b>Plan ${win} looks better.</b> ${A.name} − ${O.name} = <b>${pp(d)} points</b> (95% range ${pp(lo)} to ${pp(hi)})${warn}.`)
        : tx(`<b>${A.name} 和 ${O.name} 分不出高下。</b>${A.name} − ${O.name} = ${pp(d)} 个百分点，但 95% 区间（${pp(lo)} 到 ${pp(hi)}）跨过了 0${warn}。`, `<b>No clear winner between ${A.name} and ${O.name}.</b> ${A.name} − ${O.name} = ${pp(d)} points, but the 95% range (${pp(lo)} to ${pp(hi)}) includes zero${warn}.`);
    }).map(t => `<div>${t}</div>`).join('');
  }
  function drawTiers(id, title, B, cur) {
    const W = 300, H = 180, m = { l: 6, r: 6, t: 26, b: 34 }, n = B.length, step = (W - m.l - m.r) / n;
    const max = Math.max(.1, ...B.filter(b => b.n >= SPARSE).map(b => b.hi), ...B.map(b => b.rate || 0)) * 1.08, Y = v => H - m.b - Math.min(v, max) / max * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}"><text x="${m.l}" y="12" class="lbl">${title}</text>`;
    B.forEach((b, j) => {
      const x = m.l + j * step + step * .16, bw = step * .68, thin = b.n < SPARSE, on = j === cur, col = on ? PLAN_COL[S.active] : 'var(--seq1)';
      if (b.rate != null && b.n >= 10) {   // under 10 games the estimate is mostly the lane prior
        s += `<rect x="${x}" y="${Y(b.rate)}" width="${bw}" height="${H - m.b - Y(b.rate)}" rx="3" fill="${col}" opacity="${thin ? .25 : on ? 1 : .6}"><title>${b.t}: ${pc(b.rate)} · ${fmt(b.hits)}/${fmt(b.n)}</title></rect>`;
        if (!thin) s += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${Y(b.lo)}" y2="${Y(b.hi)}" stroke="var(--ink2)" stroke-width="1.2"/>`;
        s += `<text x="${x + bw / 2}" y="${(thin ? Y(b.rate) : Math.min(Y(b.hi), Y(b.rate))) - 5}" text-anchor="middle" class="${on ? 'lbl' : ''}">${pc(b.rate, 0)}</text>`;
      } else s += `<text x="${x + bw / 2}" y="${H - m.b - 6}" text-anchor="middle">${b.n ? tx('太少', 'few') : '—'}</text>`;
      s += `<text x="${x + bw / 2}" y="${H - m.b + 14}" text-anchor="middle" class="${on ? 'lbl' : ''}">${esc(b.t.replace(/ languages?$/, ''))}</text><text x="${x + bw / 2}" y="${H - m.b + 26}" text-anchor="middle" style="font-size:9.5px">n ${fmt(b.n)}</text>`;
    });
    $(id).innerHTML = s + `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--axis)"/></svg>`;
  }
  function drawHint(ifPrice, ifLang, cur) {
    const pl = S.plans[S.active], el = $('stHint');
    if (!cur.n) { el.innerHTML = tx(`方案 ${pl.name} 没有可比的历史游戏，先换一个价格档或语言数。`, `Plan ${pl.name} has no comparable past games yet; try another price tier or number of languages.`); return; }
    // suggest a change only when its paired 95% range of the gain stays above zero
    const best = (B, curJ) => B.filter(b => b.j !== curJ && b.n >= SPARSE && b.dlo > 0).sort((a, b) => b.dlo - a.dlo)[0];
    const bp = best(ifPrice, pl.price), bl = best(ifLang, pl.lt), parts = [], pts = v => (v * 100).toFixed(1);
    if (bp) parts.push(tx(`把价格改到 <b>${bp.t}</b>：${pc(cur.rate)} → <b>${pc(bp.rate)}</b>（+${pts(bp.rate - cur.rate)} 个百分点，95% 区间 +${pts(bp.dlo)} 到 +${pts(bp.dhi)}）。`, `Move the price to <b>${bp.t}</b>: ${pc(cur.rate)} → <b>${pc(bp.rate)}</b> (+${pts(bp.rate - cur.rate)} points, 95% range +${pts(bp.dlo)} to +${pts(bp.dhi)}).`));
    if (bl) parts.push(tx(`把语言改成 <b>${bl.t}</b>：${pc(cur.rate)} → <b>${pc(bl.rate)}</b>（+${pts(bl.rate - cur.rate)} 个百分点，95% 区间 +${pts(bl.dlo)} 到 +${pts(bl.dhi)}）。`, `Support <b>${bl.t}</b>: ${pc(cur.rate)} → <b>${pc(bl.rate)}</b> (+${pts(bl.rate - cur.rate)} points, 95% range +${pts(bl.dlo)} to +${pts(bl.dhi)}).`));
    el.innerHTML = parts.length ? `<b>${tx('可以考虑：', 'Worth trying:')}</b> ${parts.join(' ')} <span class="muted">${tx('这些是相关关系：更贵、语言更多的游戏通常也投入更大。', 'These are associations: pricier, more localised games also tend to have bigger budgets.')}</span>`
      : tx(`单改价格或语言数，都没有哪一档能在 95% 区间内明显好过方案 ${pl.name}。`, `No single change of price or languages clearly beats Plan ${pl.name} within its 95% range.`);
  }
  function drawSimilar(rows, pl) {
    const k = def(), scored = [];
    for (const r of rows) { if (!DB.inScope(r)) continue;   // 2025 games have not had time to collect reviews
      scored.push([r, DB.prominence(r, S.combo) - .12 * Math.abs(pTier(r) - pl.price) - .08 * Math.abs(lTier(r) - pl.lt) + Math.log10(1 + DB.col.reviews[r]) / 100]); }
    scored.sort((a, b) => b[1] - a[1]);
    const pick = want => scored.filter(([r]) => DB.hit(r, k) === want).slice(0, 6).map(([r]) => DB.game(r));
    const card = g => {
      return `<div><div class="st-game">${coverHtml(g)}</div>
        <div class="st-gcap"><b title="${esc(g.n)}">${esc(g.n)}</b><span>${g.y} · ${g.c ? money(g.c) : w('免费')} · ${g.nl} ${tx('种语言', 'lang.')} · ${fmt(g.rv)} ${tx('评价', 'reviews')}</span></div></div>`; };
    $('stSimHit').innerHTML = pick(1).map(card).join('') || `<div class="st-empty">—</div>`;
    $('stSimMiss').innerHTML = pick(0).map(card).join('') || `<div class="st-empty">—</div>`;
  }

  // ---------- player: find a game to play ----------
  S.seeds = []; S.dims = { tags: true, price: false, rating: true, gems: false }; S.pick = null; S.ptag = null;
  const DIMS = () => [
    ['tags', tx('玩法相近', 'Similar gameplay'), tx('标签重合，越少见、越靠前的标签越重要', 'shared tags; rarer and more defining tags count more')],
    ['rating', tx('口碑不低于我的游戏', 'Rated at least as well'), tx('好评率不低于你玩过的游戏', 'positive share at least as high as your games')],
    ['price', tx('价格相近', 'Similar price'), tx('价位和你玩过的游戏接近', 'priced like the games you played')],
    ['gems', tx('冷门佳作', 'Hidden gems'), tx('好评高、但知道的人不多', 'well rated but not widely known')]];
  const PICK_COL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
  let byAppid = null, byCover = null, recs = [];
  const rowOfAppid = a => { if (!byAppid) { byAppid = new Map(); DB.col.appid.forEach((x, r) => byAppid.set(x, r)); } return byAppid.get(+a); };
  const rowOfCover = i => { db(); if (!byCover) { byCover = new Map(); DB.col.cover.forEach((x, r) => { if (x >= 0 && !byCover.has(x)) byCover.set(x, r); }); } return byCover.get(+i); };
  function renderPlayer() {
    const body = $('stBody'), g = r => DB.game(r);
    recs = S.seeds.length || S.ptag ? DB.recommend(S.seeds, S.dims, 6, S.ptag ? DB.withTags([S.ptag]) : null) : [];
    if (!recs.some(x => x.r === S.pick)) S.pick = recs.length ? recs[0].r : null;   // the first pick is explained right away
    const seedCard = r => { const x = g(r);
      return `<div class="st-seed"><div class="st-game sm">${coverHtml(x)}</div><div><b>${esc(x.n)}</b><span>${x.y} · ${x.p == null ? '—' : pc(x.p, 0)} ${tx('好评', 'positive')}</span></div><button type="button" data-unseed="${r}" aria-label="${tx('移除', 'Remove')}">×</button></div>`; };
    body.innerHTML = `
      <section class="st-card st-pin">
        <div class="st-pcol"><h3><i class="st-n">1</i>${tx('你玩过的游戏', 'Games you have played')}</h3>
          <div class="st-seeds">${S.seeds.map(seedCard).join('')}
            ${S.seeds.length < 5 ? `<div class="st-search"><input id="stQ" autocomplete="off" placeholder="${tx('搜索游戏名…', 'Search a game…')}" aria-label="${tx('搜索游戏', 'Search a game')}"><div class="st-sugg" id="stSugg" role="listbox"></div></div>` : ''}</div>
          ${S.ptag ? `<div class="st-only"><span>${tx('只推荐这个类别：', 'Only games tagged')}</span> <b>${esc(S.ptag)}</b><button type="button" data-unptag="1" aria-label="${tx('取消类别筛选', 'Remove the tag filter')}">×</button></div>` : ''}
          ${S.seeds.length ? '' : `<div class="st-presets">${tx('例如：', 'For example:')} <button type="button" data-example="1">Slay the Spire + Hades + Stardew Valley</button></div>`}</div>
        <div class="st-pcol"><h3><i class="st-n">2</i>${tx('比较时你在意什么？', 'What matters to you?')}</h3>
          <div class="st-dims">${DIMS().map(([k, t, d]) => `<button type="button" data-dim="${k}" class="${S.dims[k] ? 'on' : ''}" aria-pressed="${!!S.dims[k]}"><b>${t}</b><small>${d}</small></button>`).join('')}</div></div>
      </section>
      ${!S.seeds.length && !S.ptag ? `<div class="st-empty">${tx('先加至少一款你玩过的游戏。三款效果最好。', 'Add at least one game you have played. Three works best.')}</div>`
        : !recs.length ? `<div class="st-empty">${S.ptag && !Object.values(S.dims).some(Boolean) || !S.ptag ? tx('至少选一个比较维度。', 'Pick at least one thing that matters.') : tx('这个类别里没有符合条件的游戏。', 'No game in this tag qualifies.')}</div>` : `
      <section><div class="st-hd" style="margin:6px 0 12px"><h3 class="st-h2">${tx('为你推荐', 'Recommended for you')}</h3><p class="cap" style="margin:0">${S.seeds.length ? tx('每张卡片写着推荐理由。下面先解释第 1 款；点其他卡片可切换。', 'Each card says why it was picked. The first one is explained below; pick another to switch.') : tx(`还没有输入玩过的游戏，先列出「${esc(S.ptag)}」里口碑很好、风格各不相同的游戏（好评率按评价数修正，评价少的会被拉向平均）。加一款你玩过的游戏，推荐会更贴近你。`, `No games entered yet, so these are highly rated ${esc(S.ptag)} games of different kinds (ratings are adjusted for review count, so games with few reviews are pulled toward average). Add a game you played to make them personal.`)}</p></div>
        <div class="st-recs">${recs.map(recCard).join('')}</div></section>
      <section class="st-card" id="stWhy"></section>`}`;
    if (recs.length) drawWhy();
    wirePlayer();
  }
  function headline(x) {
    const g = DB.game(x.r);
    if (!S.seeds.length) return ['rating', S.dims.gems && x.gem ? tx(`「${S.ptag}」里的冷门佳作：${fmt(g.rv)} 条评价，${pc(g.p, 0)} 好评`, `Hidden ${S.ptag} gem: ${fmt(g.rv)} reviews, ${pc(g.p, 0)} positive`) : tx(`「${S.ptag}」里口碑很好：${pc(g.p, 0)} 好评，${fmt(g.rv)} 条评价`, `Highly rated ${S.ptag} game: ${pc(g.p, 0)} positive from ${fmt(g.rv)} reviews`)];
    const s = DB.name(S.seeds[x.best]);
    if (S.dims.gems && x.gem) return ['gem', tx(`冷门佳作：${fmt(g.rv)} 条评价，${pc(g.p, 0)} 好评`, `Hidden gem: ${fmt(g.rv)} reviews, ${pc(g.p, 0)} positive`)];
    if (S.dims.tags && x.shared.length) return ['tags', tx(`玩起来像 ${s}`, `Plays like ${s}`)];
    if (S.dims.rating) { const lo = Math.min(...S.seeds.map(r => DB.ratio(r) ?? 0));
      return ['rating', (g.p ?? 0) >= lo ? tx(`口碑不输你的游戏：${pc(g.p, 0)} 好评`, `Rated as well as your games: ${pc(g.p, 0)}`) : tx(`口碑不错：${pc(g.p, 0)} 好评`, `Well rated: ${pc(g.p, 0)} positive`)]; }
    if (S.dims.price) return ['price', tx(`和 ${s} 价位相近`, `Priced like ${s}`)];
    return ['gem', tx(`口碑好、知道的人不多：${pc(g.p, 0)} 好评`, `Well rated, not widely known: ${pc(g.p, 0)}`)];
  }
  function recCard(x, i) {
    const g = DB.game(x.r), [, why] = headline(x), on = S.pick === x.r;
    const bars = DIMS().filter(([k]) => S.dims[k] && x.dims[k] != null).map(([k, t]) => `<div class="st-db"><span>${t}</span><i><b style="width:${Math.round(x.dims[k] * 100)}%;background:${PICK_COL[i]}"></b></i><em>${Math.round(x.dims[k] * 100)}</em></div>`).join('');
    return `<article class="st-rec ${on ? 'on' : ''}" style="--pc:${PICK_COL[i]}">
      <div class="st-game">${coverHtml(g)}<span class="st-num">${i + 1}</span></div>
      <div class="st-rb"><h4 title="${esc(g.n)}">${esc(g.n)}</h4><div class="st-meta">${g.y} · ${fmt(g.rv)} ${tx('评价', 'reviews')} · ${pc(g.p, 0)} ${tx('好评', 'positive')} · ${g.c ? money(g.c) : w('免费')}</div>
        <div class="st-why">${esc(why)}</div>
        <div class="st-tags">${x.shared.slice(0, 4).map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="st-dbs">${bars}</div>
        <button type="button" class="st-btn ${on ? 'pri' : ''}" data-pick="${x.r}">${on ? tx('已选择 ✓', 'Picked ✓') : tx('选这款', 'Pick this game')}</button></div></article>`;
  }
  // one row of a two-game comparison: both games on one shared scale, each on its own line so equal values never hide each other
  function dumbRow(label, delta, sc, a, b, fmtv) {
    const cw = ($('stWhy') || document.body).clientWidth, narrow = cw < 560, W = Math.round(Math.max(300, Math.min(760, narrow ? cw - 30 : cw - 360))), H = 66, m = { l: 10, r: 10 };   // drawn near 1:1 so text stays body-sized
    const tf = v => sc.log ? Math.log10(Math.max(v, 0) + 1) : v, A = tf(sc.a), B2 = tf(sc.b);
    const X = v => m.l + (Math.min(Math.max(tf(v), A), B2) - A) / (B2 - A) * (W - m.l - m.r);
    let g = `<svg viewBox="0 0 ${W} ${H}" class="st-dsvg" role="img" aria-label="${esc(label)}"><line x1="${m.l}" x2="${W - m.r}" y1="${H - 16}" y2="${H - 16}" stroke="var(--grid)"/>`;
    const ticks = narrow && sc.ticksN ? sc.ticksN : sc.ticks;
    ticks.forEach((t, k) => g += `<line x1="${X(t)}" x2="${X(t)}" y1="${H - 19}" y2="${H - 13}" stroke="var(--grid)"/><text x="${X(t)}" y="${H - 2}" text-anchor="${k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}">${(sc.tf || fmtv)(t)}${k === ticks.length - 1 && sc.plus ? '+' : ''}</text>`);
    if (a.v != null && b.v != null) g += `<line x1="${X(a.v)}" x2="${X(b.v)}" y1="14" y2="34" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
    for (const [p, y] of [[a, 14], [b, 34]]) {
      if (p.v == null) { g += `<text x="${m.l}" y="${y + 4}" class="st-dna">${esc(p.short)}: ${tx('没有数据', 'no data')}</text>`; continue; }
      const x = X(p.v), right = x > W - (narrow ? 120 : 170);
      g += `<circle cx="${x}" cy="${y}" r="${p.ref ? 6 : 7.5}" fill="${p.ref ? 'var(--surface)' : p.col}" stroke="${p.ref ? 'var(--ink)' : 'var(--ink)'}" stroke-width="${p.ref ? 2 : 1.5}"/>`
        + `<text x="${right ? x - 12 : x + 12}" y="${y + 4}" text-anchor="${right ? 'end' : 'start'}" class="st-dv"><tspan class="st-dvn">${esc(p.short)}</tspan> ${fmtv(p.v)}</text>`;
    }
    return `<div class="st-dr"><div class="st-drh"><b>${label}</b><span>${delta}</span></div>${g}</svg></div>`;
  }
  function drawWhy() {
    const el = $('stWhy'); if (!el) return;
    const x = recs.find(r => r.r === S.pick);
    if (!x) { el.innerHTML = ''; return; }
    const g = DB.game(x.r), i = recs.indexOf(x), seeds = S.seeds.map(r => DB.game(r)), cut = v => v.length > 22 ? v.slice(0, 21) + '…' : v;
    // reference: the closest of your games, or with no games entered, the tag's typical (median) game
    let ref;
    if (seeds.length) ref = seeds[x.best];
    else { const rows = Array.from(DB.withTags([S.ptag])).filter(r => DB.col.reviews[r] >= 50), med = f => { const v = rows.map(f).filter(z => z != null).sort((p, q) => p - q); return medianOf(v); };
      ref = { n: tx(`「${S.ptag}」中位游戏`, `typical ${S.ptag} game`), c: med(r => DB.price[r]), p: med(r => DB.ratio(r)), rv: med(r => DB.col.reviews[r]), typical: true }; }
    const A = { v: null, short: cut(ref.n), ref: true }, Bp = { v: null, short: cut(g.n), col: PICK_COL[i] };
    const row = (label, delta, sc, f, fmtv) => dumbRow(label, delta, sc, { ...A, v: f(ref) }, { ...Bp, v: f(g) }, fmtv);
    const parts = [], rn = `<b>${esc(ref.n)}</b>`;
    const order = x.seedScores.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]);
    if (S.dims.tags && seeds.length) {
      const chips = x.shared.slice(0, 8).map(t => `<span class="st-tg">${esc(t)}</span>`).join(' ');
      parts.push(`<div class="st-dr"><div class="st-drh"><b>${tx('玩法', 'Gameplay')}</b><span>${tx(`和 ${rn} 标签匹配 ${Math.round(x.dims.tags * 100)}%`, `${Math.round(x.dims.tags * 100)}% tag match with ${rn}`)}</span></div>
        <div class="st-chips">${chips ? tx('共同标签：', 'Both are tagged ') + chips : tx('没有共同的主要标签。', 'No major tags in common.')}</div></div>`);
    }
    const moneyV = v => v ? money(v) : w('免费'), pts = v => Math.abs(Math.round(v * 100));
    if (S.dims.price) {
      const dv = (g.c || 0) - (ref.c || 0);
      const delta = !g.c && !ref.c ? tx('都免费', 'Both are free') : Math.abs(dv) < .005 ? tx(`和 ${rn} 同价`, `Same price as ${rn}`)
        : dv < 0 ? tx(`比 ${rn} 便宜 <b>${money(-dv)}</b>`, `<b>${money(-dv)} cheaper</b> than ${rn}`) : tx(`比 ${rn} 贵 <b>${money(dv)}</b>`, `<b>${money(dv)} more</b> than ${rn}`);
      parts.push(row(tx('价格', 'Price'), delta, { a: 0, b: 70, log: true, plus: true, ticks: [0, 5, 10, 20, 40, 70], ticksN: [0, 5, 10, 20, 70], tf: v => v ? '$' + Math.round(v) : w('免费') }, z => z.c ?? 0, moneyV));
    }
    if (S.dims.rating || S.dims.gems || !seeds.length) {
      const dv = g.p != null && ref.p != null ? g.p - ref.p : null;
      const delta = dv == null ? tx('缺少好评率', 'Rating missing') : Math.abs(dv) < .005 ? tx(`和 ${rn} 一样`, `Same as ${rn}`)
        : dv > 0 ? tx(`比 ${rn} 高 <b>${pts(dv)} 个百分点</b>`, `<b>${pts(dv)} points higher</b> than ${rn}`) : tx(`比 ${rn} 低 ${pts(dv)} 个百分点`, `${pts(dv)} points lower than ${rn}`);
      parts.push(row(tx('好评率', 'Positive reviews'), delta, { a: .4, b: 1, ticks: [.4, .6, .8, 1] }, z => z.p, v => pc(v, 0)));
    }
    if (S.dims.gems || !seeds.length) {
      const k2 = ref.rv && g.rv ? g.rv / ref.rv : null;
      const delta = k2 == null ? '' : k2 < .9 ? tx(`评价数是 ${rn} 的 1/${(1 / k2).toFixed(k2 > .2 ? 1 : 0)}，知道的人更少`, `${(1 / k2).toFixed(k2 > .2 ? 1 : 0)}× fewer reviews than ${rn}: less known`) : k2 > 1.1 ? tx(`评价数是 ${rn} 的 ${k2.toFixed(1)} 倍`, `${k2.toFixed(1)}× the reviews of ${rn}`) : tx(`评价数和 ${rn} 差不多`, `About as many reviews as ${rn}`);
      parts.push(row(tx('评价数（知名度，对数刻度）', 'Reviews (how known, log scale)'), delta + (x.gem ? tx('；评价少、好评高，是冷门佳作', '; few reviews and well rated: a hidden gem') : ''), { a: 10, b: 500000, log: true, ticks: [10, 100, 1000, 10000, 100000, 500000], ticksN: [10, 1000, 100000] }, z => z.rv, v => fmtK(v)));
    }
    let lead = '';
    if (seeds.length > 1 && order[0][0] - order[order.length - 1][0] > .01) lead = order[0][0] - order[1][0] <= .01
      ? tx(`和 <b>${esc(seeds[order[0][1]].n)}</b>、<b>${esc(seeds[order[1][1]].n)}</b> 一样接近；下面和前者对比。`, `Equally close to <b>${esc(seeds[order[0][1]].n)}</b> and <b>${esc(seeds[order[1][1]].n)}</b>; compared with the first below.`)
      : tx(`你玩过的游戏里，它最接近 <b>${esc(ref.n)}</b>，下面逐项对比。`, `Of your games, it is nearest to <b>${esc(ref.n)}</b>; compared item by item below.`);
    else if (seeds.length) lead = tx(`下面和你玩过的 <b>${esc(ref.n)}</b> 逐项对比。`, `Compared item by item with <b>${esc(ref.n)}</b>, which you played.`);
    else lead = tx(`下面和「${esc(S.ptag)}」里的中位游戏（50+ 评价）对比。`, `Compared with the typical ${esc(S.ptag)} game (median of those with 50+ reviews).`);
    el.innerHTML = `<div class="st-whyp" style="--pc:${PICK_COL[i]}"><div class="st-game">${coverHtml(g)}<span class="st-num">${i + 1}</span></div>
      <div class="st-whyb"><div class="kicker" style="margin-bottom:6px">${tx('为什么推荐', 'Why this game')}</div><h3 style="font-size:22px;margin-bottom:4px">${esc(g.n)}</h3>
        <p class="cap" style="margin:0 0 6px">${lead}</p>
        <div class="st-dleg"><span><i class="o"></i>${esc(ref.n)}</span><span><i style="background:${PICK_COL[i]}"></i>${esc(g.n)}</span></div>
        ${parts.join('')}</div></div>`;
  }
  function wirePlayer() {
    const body = $('stBody');
    body.onclick = e => {
      const t = e.target.closest('[data-unseed],[data-dim],[data-pick],[data-example],[data-seed],[data-unptag]'); if (!t) return;
      if (t.dataset.unptag) { S.ptag = null; render(); return; }
      if (t.dataset.unseed) S.seeds = S.seeds.filter(r => r !== +t.dataset.unseed);
      else if (t.dataset.dim) { S.dims[t.dataset.dim] = !S.dims[t.dataset.dim]; }
      else if (t.dataset.pick) { S.pick = +t.dataset.pick; renderPlayerPick(); return; }
      else if (t.dataset.example) S.seeds = ['Slay the Spire', 'Hades', 'Stardew Valley'].map(q => DB.search(q, 1)[0]).filter(r => r != null);
      else if (t.dataset.seed) { const r = +t.dataset.seed; if (!S.seeds.includes(r)) S.seeds.push(r); render(); const q = $('stQ'); if (q) q.focus(); return; }
      render();
    };
    const q = $('stQ'), sug = $('stSugg'); if (!q) return;
    let tm = 0;
    q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => {
      const rows = DB.search(q.value, 8).filter(r => !S.seeds.includes(r));
      sug.innerHTML = rows.map(r => { const g = DB.game(r); return `<button type="button" role="option" data-seed="${r}"><b>${esc(g.n)}</b><span>${g.y} · ${fmt(g.rv)} ${tx('评价', 'reviews')}</span></button>`; }).join('')
        || (q.value.trim() ? `<div class="st-none">${tx(`没找到“${esc(q.value.trim())}”。试试英文原名，或名字的一部分。`, `No game matches “${esc(q.value.trim())}”. Try its English title or part of the name.`)}</div>` : '');
      sug.classList.toggle('open', !!sug.innerHTML); }, 120); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = sug.querySelector('[data-seed]'); if (b) b.click(); } if (e.key === 'Escape') sug.classList.remove('open'); });
  }
  function renderPlayerPick() {   // a pick only changes highlights, not the ranking
    const host = document.querySelector('.st-recs'); if (host) host.innerHTML = recs.map(recCard).join('');
    drawWhy(); syncHash();
    const why = $('stWhy'); if (S.pick != null && why) why.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- charts ----------
  const svgOpen = (W, H) => `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  function drawLaneMap(L) {
    const W = 560, H = 380, m = { l: 46, r: 18, t: 14, b: 40 };
    const pts = L.comp.slice().sort((a, b) => b.n - a.n).slice(0, 45).filter(c => c.lastShare > 0);
    const me = { tag: null, lastShare: L.years[L.years.length - 1].share, ratio: L.all.ratio, n: L.all.n };
    if (!pts.length || !me.ratio) { $('stMap').innerHTML = `<div class="st-empty">${tx('这个组合的搭配标签太少。', 'Too few companion tags for this combo.')}</div>`; return; }
    const xs = [...pts.map(p => p.lastShare), me.lastShare].filter(v => v > 0), ys = [...pts.map(p => p.ratio), me.ratio];
    const x0 = Math.log10(Math.min(...xs) * .7), x1 = Math.log10(Math.max(...xs, .012) * 1.4), yMax = Math.min(8, Math.max(2, ...ys) * 1.08);
    const X = v => m.l + (Math.log10(Math.max(v, 10 ** x0)) - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => H - m.b - Math.min(v, yMax) / yMax * (H - m.t - m.b);
    const xs1 = X(.01), y1 = Y(1);
    let s = svgOpen(W, H) + `<rect x="${m.l}" y="${m.t}" width="${Math.max(0, xs1 - m.l)}" height="${y1 - m.t}" fill="rgba(57,135,229,.08)"/>
      <rect x="${xs1}" y="${y1}" width="${Math.max(0, W - m.r - xs1)}" height="${H - m.b - y1}" fill="rgba(230,103,103,.08)"/>
      <text x="${m.l + 8}" y="${m.t + 16}" style="fill:#8fbaf0;font-weight:600">${tx('蓝海：不挤、跑赢大盘', 'Blue ocean: uncrowded, beats the market')}</text>
      <text x="${W - m.r - 8}" y="${H - m.b - 8}" text-anchor="end" style="fill:#f09a9a;font-weight:600">${tx('红海：拥挤、低于大盘', 'Red ocean: crowded, below the market')}</text>
      <line x1="${m.l}" x2="${W - m.r}" y1="${y1}" y2="${y1}" stroke="var(--ink2)" stroke-dasharray="4 4"/><text x="${W - m.r - 4}" y="${y1 - 5}" text-anchor="end" class="note">1× = ${tx('大盘', 'market')}</text>
      <line x1="${xs1}" x2="${xs1}" y1="${m.t}" y2="${H - m.b}" stroke="var(--axis)" stroke-dasharray="2 4"/>`;
    for (const v of [.0005, .001, .002, .005, .01, .02, .05, .1]) { const x = X(v); if (Math.log10(v) >= x0 && Math.log10(v) <= x1) s += `<text x="${x}" y="${H - m.b + 16}" text-anchor="middle">${pc(v, v < .01 ? 1 : 0)}</text>`; }
    for (let v = 0; v <= yMax; v += yMax > 5 ? 2 : 1) s += `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v}×</text>`;
    s += `<text x="${W - m.r}" y="${H - 4}" text-anchor="end">${tx('2024 年新作中的占比（对数）→', 'share of 2024 releases (log) →')}</text>`;
    const lab = new Set([...pts].sort((a, b) => b.lo - a.lo).slice(0, 5).concat([...pts].sort((a, b) => a.ratio - b.ratio).slice(0, 2)).map(p => p.tag));
    const r = n => Math.min(14, 3 + Math.sqrt(n) / 2.4), mx = X(me.lastShare), my = Y(me.ratio), mr = Math.min(18, r(me.n) + 3);
    // labels: best first, skipped when they would collide with one already placed (or with the zone titles)
    const boxes = [[m.l, m.t, m.l + 250, m.t + 22], [W - m.r - 250, H - m.b - 22, W - m.r, H - m.b], [mx - 50, my - mr - 24, mx + 50, my - mr - 4]];
    const free = b => !boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    let labels = '';
    for (const p of [...pts].sort((a, b) => (lab.has(b.tag) - lab.has(a.tag)) || b.lo - a.lo)) {
      if (!lab.has(p.tag)) continue;
      const cx = X(p.lastShare), cy = Y(p.ratio), tw = 7 * (p.tag.length + 2), right = cx + r(p.n) + 4 + tw < W - m.r;
      const bx = right ? [cx + r(p.n) + 4, cy - 8, cx + r(p.n) + 4 + tw, cy + 6] : [cx - r(p.n) - 4 - tw, cy - 8, cx - r(p.n) - 4, cy + 6];
      if (!free(bx)) continue;
      boxes.push(bx);
      labels += `<text x="${right ? bx[0] : bx[2]}" y="${cy + 4}" text-anchor="${right ? 'start' : 'end'}" class="lbl" style="pointer-events:none;paint-order:stroke;stroke:var(--surface);stroke-width:3px">+ ${esc(p.tag)}</text>`;
    }
    for (const p of pts) s += `<circle class="st-dot" data-add="${esc(p.tag)}" data-tip="${esc(p.tag)}" cx="${X(p.lastShare)}" cy="${Y(p.ratio)}" r="${r(p.n)}" fill="${tagColor(p.tag)}" fill-opacity=".55" stroke="${tagColor(p.tag)}" opacity=".85"/>`;
    s += labels;
    s += `<circle cx="${mx}" cy="${my}" r="${mr}" fill="none" stroke="var(--ink)" stroke-width="2.5"/><circle cx="${mx}" cy="${my}" r="3" fill="var(--ink)"/>
      <text x="${mx}" y="${my - mr - 8}" text-anchor="middle" class="lbl" style="font-size:12.5px;paint-order:stroke;stroke:var(--surface);stroke-width:4px">${tx('当前组合', 'Current combo')}</text></svg>`;
    const host = $('stMap'); host.innerHTML = s;
    const by = new Map(pts.map(p => [p.tag, p]));
    host.onmousemove = e => { const t = e.target.dataset && e.target.dataset.tip; if (!t) return hideTip(); const p = by.get(t);
      showTip(e, `<b>${esc(S.combo.join(' + '))} + ${esc(t)}</b>${row(tx('游戏数', 'Games'), fmt(p.n))}${row(tx('vs 大盘', 'vs market'), `${times(p.ratio)} (${times(p.lo)}–${times(p.hi)})`)}${row(tx('2024 新作', '2024 releases'), `${fmt(p.last)} · ${pc(p.lastShare, 2)}`)}${note(tx('点击加入组合', 'Click to add to the combo'))}`); };
    host.onmouseleave = hideTip;
  }
  function drawTrend(L) {
    const W = 560, H = 380, m = { l: 46, r: 18, t: 16, b: 30 }, ys = L.years, n = ys.length, gap = 26;
    const hTop = 120, top0 = m.t, bot0 = m.t + hTop + gap, hBot = H - m.b - bot0;
    const step = (W - m.l - m.r) / n, X = i => m.l + step * (i + .5);
    const sMax = Math.max(...ys.map(y => y.share)) * 1.15 || 1, YS = v => top0 + hTop - v / sMax * hTop;
    const rMax = Math.min(8, Math.max(2, ...ys.map(y => Math.min(y.hi || 0, 3 * (L.all.ratio || 1)))) * 1.05), YR = v => bot0 + hBot - Math.min(v, rMax) / rMax * hBot;
    let s = svgOpen(W, H) + `<text x="${m.l - 6}" y="${top0 + 4}" class="note" text-anchor="start" dx="6">${tx('新作占比', 'share of new releases')}</text>`;
    ys.forEach((y, i) => { const x = X(i), bw = step * .56, h = top0 + hTop - YS(y.share);
      s += `<rect x="${x - bw / 2}" y="${YS(y.share)}" width="${bw}" height="${Math.max(0, h)}" rx="3" fill="var(--s1)" fill-opacity="${.35 + .65 * i / (n - 1)}" data-i="${i}"/>`;
      if (i === 0 || i === n - 1) s += `<text x="${x}" y="${YS(y.share) - 6}" text-anchor="middle" class="lbl">${pc(y.share, 2)}</text>`; });
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${top0 + hTop}" y2="${top0 + hTop}" stroke="var(--axis)"/>`;
    for (let v = 0; v <= rMax; v += rMax > 5 ? 2 : 1) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${YR(v)}" y2="${YR(v)}" stroke="var(--grid)"/><text x="${m.l - 8}" y="${YR(v) + 4}" text-anchor="end">${v}×</text>`;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${YR(1)}" y2="${YR(1)}" stroke="var(--ink2)" stroke-dasharray="4 4"/><text x="${(X(0) + X(1)) / 2}" y="${YR(1) + 15}" text-anchor="middle" class="note">1× = ${tx('大盘', 'market')}</text>`;
    s += `<text x="${m.l - 6}" y="${bot0 - 6}" class="note" dx="6">${tx('成功率 vs 大盘', 'success vs the market')}</text>`;
    // contiguous runs of years with games; empty years leave a gap
    const runs = []; ys.forEach((y, i) => { if (y.ratio == null) return; const r = runs[runs.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]); });
    for (const r of runs) {
      const band = r.map(i => `${X(i)},${YR(ys[i].hi)}`).concat(r.slice().reverse().map(i => `${X(i)},${YR(ys[i].lo)}`)).join(' ');
      s += `<polygon points="${band}" fill="var(--accent)" fill-opacity=".16"/><polyline points="${r.map(i => `${X(i)},${YR(ys[i].ratio)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`;
    }
    ys.forEach((y, i) => { if (y.ratio == null) { s += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${y.y}</text>`; return; } s += `<circle cx="${X(i)}" cy="${YR(y.ratio)}" r="${i === 0 || i === n - 1 ? 4.5 : 3}" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/>`;
      if (i === 0 || i === n - 1) s += `<text x="${X(i)}" y="${YR(y.ratio) - 10}" text-anchor="middle" class="lbl">${times(y.ratio)}</text>`;
      s += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${y.y}</text><rect x="${X(i) - step / 2}" y="${m.t}" width="${step}" height="${H - m.b - m.t}" fill="transparent" data-i="${i}"/>`; });
    const host = $('stTrend'); host.innerHTML = s + '</svg>';
    host.onmousemove = e => { const i = e.target.dataset && e.target.dataset.i; if (i == null) return hideTip(); const y = ys[+i];
      showTip(e, `<b>${y.y}</b>${row(tx('同赛道新作', 'Lane releases'), fmt(y.n))}${row(tx('占当年新作', 'Share of releases'), pc(y.share, 2))}${row(tx('成功', 'Succeeded'), `${fmt(y.O)} / ${fmt(y.n)}`)}${row(tx('vs 大盘', 'vs market'), `${times(y.ratio)} (${times(y.lo)}–${times(y.hi)})`)}`); };
    host.onmouseleave = hideTip;
  }
  function drawComp(L) {
    const P = L.all.ratio || 0, better = L.comp.filter(c => c.ratio > P).slice(0, 10);
    const worse = L.comp.filter(c => c.ratio < P).sort((a, b) => a.hi - b.hi).slice(0, 4);
    if (!L.comp.length) { $('stComp').innerHTML = `<div class="st-empty">${tx('至少要有 30 款游戏的搭配标签才会列出来。', 'Combos need at least 30 games to be listed.')}</div>`; return; }
    const max = Math.min(8, Math.max(P, ...better.map(c => Math.min(c.hi, 3 * c.ratio)), 2) * 1.05);
    const bar = c => { const X = v => Math.min(v, max) / max * 100;
      return `<svg viewBox="0 0 100 14" preserveAspectRatio="none" style="height:14px"><rect x="0" y="4" width="100" height="6" rx="3" fill="var(--grid)"/>
        <rect x="${X(c.lo)}" y="6" width="${Math.max(.5, X(c.hi) - X(c.lo))}" height="2" fill="${tagColor(c.tag)}" opacity=".6"/>
        <rect x="0" y="4" width="${X(c.ratio)}" height="6" rx="3" fill="${tagColor(c.tag)}"/>
        <rect x="${X(P) - .4}" y="0" width=".8" height="14" fill="var(--ink)"/><rect x="${X(1) - .3}" y="1" width=".6" height="12" fill="var(--ink2)" opacity=".6"/></svg>`; };
    const rel = c => { const v = c.ratio / P; return `<span style="color:${v >= 1 ? '#8fbaf0' : '#f09a9a'}">${v >= 1 ? '+' : '−'}${Math.abs((v - 1) * 100).toFixed(0)}%</span>`; };
    const rowH = c => `<div class="row-h"><div class="c"><button class="add" type="button" data-add="${esc(c.tag)}" aria-label="${tx('加入', 'Add')} ${esc(c.tag)}">+</button></div>
      <div class="c nm" title="${esc(c.tag)}"><i style="background:${tagColor(c.tag)}"></i>${esc(c.tag)}</div><div class="c num">${fmt(c.n)}</div>
      <div class="c" style="display:flex;align-items:center;gap:8px"><div style="flex:1">${bar(c)}</div><b style="font-variant-numeric:tabular-nums;width:44px;text-align:right">${times(c.ratio)}</b></div>
      <div class="c num">${P ? rel(c) : '—'}</div><div class="c num c5">${fmt(c.last)}</div></div>`;
    const head = `<div class="h"></div><div class="h">${tx('当前组合 +', 'Current combo +')}</div><div class="h num">${tx('游戏', 'Games')}</div><div class="h">${tx('成功率 vs 大盘（细线 = 95% 区间，黑线 = 当前组合）', 'Success vs market (thin line = 95% range, tick = current combo)')}</div><div class="h num">${tx('vs 当前', 'vs current')}</div><div class="h num c5">${tx('2024 新作', '2024 releases')}</div>`;
    $('stComp').innerHTML = (better.length ? `<div class="st-sub" style="margin-top:4px">${tx('比当前组合更好', 'Better than the current combo')}</div><div class="st-comp">${head}${better.map(rowH).join('')}</div>` : `<div class="st-empty" style="padding:24px 0">${tx('没有哪个搭配明显更好：当前组合已经很窄了。', 'No narrower combo does better: this one is already sharp.')}</div>`) +
      (worse.length ? `<div class="st-sub">${tx('会拖后腿的搭配', 'Tags that drag it down')}</div><div class="st-comp">${head}${worse.map(rowH).join('')}</div>` : '');
  }
  function drawGames(L) {
    const d = DB, k = def(), top = Array.from(L.scope).sort((a, b) => d.col.reviews[b] - d.col.reviews[a]).slice(0, 12).map(r => d.game(r));
    $('stGames').innerHTML = top.map(g => {
      return `<div><div class="st-game">${coverHtml(g)}${g[k] ? `<span class="st-hit">${tx('成功', 'HIT')}</span>` : ''}</div>
        <div class="st-gcap"><b title="${esc(g.n)}">${esc(g.n)}</b><span>${g.y} · ${fmt(g.rv)} ${tx('评价', 'reviews')} · ${g.p == null ? '—' : pc(g.p, 0)} ${tx('好评', 'positive')} · ${g.c ? money(g.c) : w('免费')}</span></div></div>`; }).join('');
  }

  // ---------- entry points ----------
  // ---------- map panel: where the selected game sits in the selected tag ----------
  const posCache = new Map();
  const PANEL_HIDE = ['verdict', 'smxh', 'smx', 'kpis', 'achv'];
  function drawGamePos() {
    const box = $('gpos'); if (!box) return;
    const t = state.locked, gsel = !!(t && state.game);
    PANEL_HIDE.forEach(id => { const n = $(id); if (n) n.style.display = gsel ? 'none' : ''; });
    box.style.display = gsel ? '' : 'none';
    if (!gsel) { if (t) $('selName').textContent = t; box.innerHTML = ''; return; }
    db();
    const r = rowOfCover(state.game.i);
    if (r == null) { box.innerHTML = `<p class="cap">${tx('这款游戏不在逐款数据里。', 'This game is not in the per-game table.')}</p>`; return; }
    const g = DB.game(r);
    $('selName').textContent = `${g.n} · ${t}`;
    if (!posCache.has(t)) {   // the panel's reference: games with this tag released 2018–2024, as in every other panel number
      const rows = DB.where({ tags: [t], scope: true });
      const metric = f => { const v = []; for (const q of rows) { const z = f(q); if (z != null) v.push(z); } return Float64Array.from(v).sort(); };
      posCache.set(t, { n: rows.length, price: metric(q => DB.price[q]), reviews: metric(q => DB.col.reviews[q]), rating: metric(q => DB.ratio(q)) });
    }
    const P = posCache.get(t), sc = DB.scope;
    const out = g.y < sc[0] || g.y > sc[1] ? `<p class="st-gpnote">${tx(`这款游戏 ${g.y} 年发行，不在面板统计的 ${sc[0]}–${sc[1]} 年范围内；下面仍和这些年的同类比较。`, `Released in ${g.y}, outside the ${sc[0]}–${sc[1]} window the panel counts; it is still compared with those games below.`)}</p>` : '';
    const moneyV = v => v ? money(v) : w('免费');
    const R = [
      [tx('价格', 'Price'), P.price, g.c ?? 0, moneyV, { a: 0, b: 70, log: true, plus: true, ticks: [0, 5, 10, 20, 40, 70], tf: v => v ? '$' + Math.round(v) : w('免费') }, tx('更贵', 'pricier')],
      [tx('评价数', 'Reviews'), P.reviews, g.rv, fmtK, { a: 1, b: 500000, log: true, ticks: [1, 10, 100, 1000, 10000, 100000, 500000] }, tx('评价更多', 'more reviewed')],
      [tx('好评率', 'Positive reviews'), P.rating, g.p, v => pc(v, 0), { a: 0, b: 1, ticks: [0, .25, .5, .75, 1] }, tx('口碑更好', 'better rated')]];
    const W = 420, H = 64, m = { l: 8, r: 8 };
    const rows = R.map(([lab, arr, v, fmtv, scl, better]) => {
      const tf = z => scl.log ? Math.log10(Math.max(z, 0) + 1) : z, A = tf(scl.a), B2 = tf(scl.b), X = z => m.l + (Math.min(Math.max(tf(z), A), B2) - A) / (B2 - A) * (W - m.l - m.r);
      const med = medianOf(arr), nb = 40, bins = new Array(nb).fill(0);
      for (const z of arr) bins[Math.min(nb - 1, Math.max(0, Math.floor((tf(z) - A) / (B2 - A) * nb)))]++;
      const bm = Math.sqrt(Math.max(1, ...bins)), bw = (W - m.l - m.r) / nb;
      let below = 0; if (v != null) for (const z of arr) { if (z < v) below++; else break; }
      let svg = `<svg viewBox="0 0 ${W} ${H}" class="st-dsvg">`;
      bins.forEach((c, k) => { const h = Math.sqrt(c) / bm * 30; svg += `<rect x="${m.l + k * bw}" y="${H - 18 - h}" width="${bw - 1}" height="${h}" fill="var(--rest)" opacity=".6"/>`; });
      if (med != null) svg += `<line x1="${X(med)}" x2="${X(med)}" y1="8" y2="${H - 16}" stroke="var(--ink2)" stroke-dasharray="3 3"/>`;
      if (v != null) svg += `<line x1="${X(v)}" x2="${X(v)}" y1="6" y2="${H - 16}" stroke="var(--sel)" stroke-width="2.5"/><circle cx="${X(v)}" cy="8" r="5" fill="var(--sel)"/>`;
      scl.ticks.forEach((tk, k) => svg += `<text x="${X(tk)}" y="${H - 3}" text-anchor="${k === 0 ? 'start' : k === scl.ticks.length - 1 ? 'end' : 'middle'}">${(scl.tf || fmtv)(tk)}${k === scl.ticks.length - 1 && scl.plus ? '+' : ''}</text>`);
      const share = Math.min(99, Math.floor(below / arr.length * 100)) + '%';   // floored, so 99.9% never reads as 'all of them'
      const where = v == null ? tx('缺失（还没有评价）', 'missing (no reviews yet)') : arr.length && below === arr.length ? tx('同类中最高', `the highest of them`) : tx(`高于 ${share} 的同类`, `${better} than ${share} of them`);
      return `<div class="st-gprow"><div class="st-gph"><b>${lab}</b><span><em style="color:var(--sel)">${v == null ? '—' : fmtv(v)}</em> · ${tx('同类中位', 'tag median')} ${med == null ? '—' : fmtv(med)} · ${where}</span><small>n = ${fmt(arr.length)}</small></div>${svg}</svg></div>`;
    });
    box.innerHTML = `<div class="st-gphd">${tx(`<b>${esc(g.n)}</b> 在「${esc(t)}」里的位置`, `Where <b>${esc(g.n)}</b> sits among ${esc(t)} games`)}</div>
      <p class="st-gpnote">${tx(`灰色是 ${fmt(P.n)} 款 ${sc[0]}–${sc[1]} 年发行的「${esc(t)}」游戏，虚线是同类中位数，彩色线是这款游戏。每项只计该项有数据的游戏。`, `Grey: the ${fmt(P.n)} ${esc(t)} games released ${sc[0]}–${sc[1]}. Dashed: the tag median. Coloured: this game. Each row counts only games with that value.`)}</p>${out}${rows.join('')}
      <p class="st-gpnote">${tx('点上方面包屑里的 × 取消选中，回到类别总览。', 'Clear the game with × in the breadcrumb above to return to the tag overview.')}</p>`;
  }
  function init() {
    // entry points: the world-select screen and the map toolbar both offer the two tasks by name
    const entry = (cls, id, label, opts) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.id = id; b.innerHTML = label; b.onclick = () => open(opts); return b; };
    const acts = document.querySelector('#ui3 .acts');
    if (acts) { acts.prepend(entry('ghost', 'studioFind', tx('找游戏玩', 'Find a game'), { view: 'player' })); acts.prepend(entry('ghost', 'studioBtn', tx('做一款游戏', 'Plan a game'), { view: 'lane' })); }
    const sel = document.querySelector('#select .selhead');
    if (sel) {
      const box = document.createElement('div'); box.className = 'st-entry';
      box.append(entry('st-ent', 'stEntryDev', `<b>${tx('我在做游戏 →', "I'm making a game →")}</b><small>${tx('选赛道、看拥挤度、比较方案', 'pick a lane, check crowding, compare plans')}</small>`, { view: 'lane' }),
        entry('st-ent', 'stEntryPlayer', `<b>${tx('我在找游戏玩 →', "I'm looking for a game →")}</b><small>${tx('输入玩过的游戏，看推荐和理由', 'enter games you played, get picks with reasons')}</small>`, { view: 'player' }));
      sel.appendChild(box);
    }
    const hinfo = document.querySelector('.hinfo');
    if (hinfo) {
      const box = document.createElement('div'); box.className = 'st-hacts';
      box.innerHTML = `<button class="st-btn" type="button" id="toFind"></button><button class="st-btn pri" type="button" id="toLane"></button>`;
      hinfo.appendChild(box);
      $('toLane').onclick = () => state.locked && open({ combo: [state.locked], view: 'lane' });
      $('toFind').onclick = () => { if (!state.locked) return; if (state.game) open({ view: 'player', seedCover: state.game.i, ptag: null }); else open({ view: 'player', ptag: state.locked }); };
      const v = document.getElementById('verdict'), gp = document.createElement('section'); gp.id = 'gpos'; gp.className = 'gpos'; v.parentNode.insertBefore(gp, v);
    }
    const sync = () => {
      const t = state.locked, gsel = !!(t && state.game), L = $('toLane'), F = $('toFind');
      if (L) { L.parentElement.style.display = t ? '' : 'none'; L.textContent = tx(`分析「${t}」的市场 →`, `Analyse the ${t} market →`); }
      if (F) F.textContent = gsel ? tx('找与这款相似的游戏 →', 'Find games like this one →') : tx(`找「${t}」里的好游戏 →`, `Find ${t} games to play →`);
      drawGamePos();
    };
    for (const fn of ['lock', 'refreshSel', 'clearGame', 'drawKpis']) {   // keep the panel in step with every change of selection
      const orig = window[fn]; if (typeof orig !== 'function') continue;
      window[fn] = function (...a) { const r = orig.apply(this, a); sync(); return r; };
    }
    sync();
    if (location.hash.startsWith('#studio/')) {
      const [, view, tags, sm] = location.hash.slice(1).split('/');
      if (view === 'player') { const pt = location.hash.slice(1).split('/')[4]; open({ view, sm, seedAppids: tags ? tags.split('+').filter(Boolean) : [], ptag: pt ? decodeURIComponent(pt) : null }); }
      else open({ view: view || 'lane', sm, combo: tags ? tags.split('+').map(decodeURIComponent).filter(Boolean) : undefined });
    }
  }
  return { init, open, close, state: S };
})();
Studio.init();
