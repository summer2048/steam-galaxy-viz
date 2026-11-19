/* Studio: task views on top of the per-game table (GameDB). Runs after the main page script and reuses its helpers
   (tx, w, esc, fmt, pct, showTip, hideTip, row, note, famOf, famColor, assetB64, state, T, lock). */
const Studio = (() => {
  const DEFS = { r: 'hit', o: 'hit_o', g: 'hit_g' };
  const DEF_TXT = {
    r: tx('拿到 500+ 条评价', 'reach 500+ reviews'), o: tx('持有量区间上限达到 20 万+', 'reach 200k+ owners (top of the owner band)'), g: tx('按上限估算的流水达到 $100 万+', 'gross an estimated $1M+ (upper bound: owner band top × list price)'),
  };
  // Studio keeps all three definitions from the per-game table; the map itself only shows reviews (raw and year-adjusted).
  const ST_SM = [
    { k: 'r', t: tx('评价 ≥ 500', 'Reviews ≥ 500'), s: tx('至少 500 条 Steam 评价', 'At least 500 Steam reviews') },
    { k: 'o', t: tx('持有量上限 ≥ 20 万', 'Owners ≥ 200k (band top)'), s: tx('SteamSpy 持有量区间上限 ≥ 20 万', 'Top of the SteamSpy owner band ≥ 200k') },
    { k: 'g', t: tx('估算流水 ≥ $100 万', 'Est. gross ≥ $1M'), s: tx('持有量上限 × 原价 ≥ $100 万（未扣分成与折扣，是上限估计）', "Owner upper bound × list price ≥ $1M (before Steam's cut and discounts, an upper bound)") },
  ];
  const PRESETS = [['Card Game'], ['Deckbuilding', 'Rogue-lite'], ['Cozy', 'Farming Sim'], ['Survival', 'Open World'], ['Puzzle'], ['Visual Novel']];
  const S = { open: false, mode: 'dev', view: 'lane', combo: ['Card Game'], sm: 'r' };
  // Watchlist (issue 024). localStorage may be missing or throw (private windows); the in-memory copy keeps the session working.
  const WATCH_KEY = 'stm-watch', WATCH_MAX = 30;
  let watchMem = null;
  const watch = {
    get() {
      if (watchMem) return { tags: watchMem.tags.slice(), games: watchMem.games.slice() };
      let v = {}; try { v = JSON.parse(localStorage.getItem(WATCH_KEY) || '{}') || {}; } catch (e) { v = {}; }
      watchMem = { tags: (Array.isArray(v.tags) ? v.tags : []).filter(t => typeof t === 'string'), games: (Array.isArray(v.games) ? v.games : []).map(Number).filter(Number.isFinite) };
      return watch.get();
    },
    has(kind, id) { return watch.get()[kind].includes(id); },
    toggle(kind, id) {
      const v = watch.get(), a = v[kind], i = a.indexOf(id);
      if (i >= 0) a.splice(i, 1); else a.unshift(id);
      v[kind] = a.slice(0, WATCH_MAX); watchMem = v;
      try { localStorage.setItem(WATCH_KEY, JSON.stringify(v)); } catch (e) {}
      return i < 0;
    },
  };
  // what Studio filled in by itself; only these untouched defaults are replaced by the watchlist on the next open
  const DEFAULT_COMBO = S.combo.slice();
  let autoDev = null, autoPlayer = '[[],null]';   // null: nothing filled in yet, so the built-in default counts as untouched
  let DB = null, root = null, tagList = null, opener = null;
  const DB_TAG_OK = t => !!T[t];

  const $ = id => document.getElementById(id);
  const def = () => DEFS[S.sm];
  const mktCache = {};   // market rate (tagged games, 2018–2024) per definition, from the per-game table rather than the map's definitions
  const mkt = () => mktCache[S.sm] ??= DB.rate(DB.where({ scope: true }), def()).rate;
  const times = v => v == null || !isFinite(v) ? '—' : (v >= 10 ? v.toFixed(0) : v.toFixed(v >= 1 ? 2 : 2)) + '×';
  const pc = (v, d = 1) => v == null ? '—' : (v * 100).toFixed(v < .01 && v > 0 ? 2 : d) + '%';
  const medianOf = v => !v.length ? null : v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;   // v sorted
  const tagColor = t => T[t] ? famColor(famOf(t)) : 'var(--fam-other)';
  const coverSrc = i => i == null ? null : 'data:image/webp;base64,' + assetB64(i);
  // embedded cover if the map has one; otherwise covers/<appid>.webp shipped next to the page; the name shows if neither loads
  const coverHtml = g => g.i != null ? `<img src="${coverSrc(g.i)}" alt="" loading="lazy">`
    : `<div class="ph">${esc(g.n)}</div><img src="covers/${g.appid}.webp" alt="" loading="lazy" onerror="this.remove()">`;

  function db() {
    if (!DB) DB = typeof GDB === 'function' ? GDB() : GameDB.open(JSON.parse($('gamesRaw').textContent));   // the map's table, parsed once
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
        <button class="st-btn" id="stBack" type="button" aria-label="${tx('返回星图', 'Back to the map')}">← <span class="lg">${tx('返回星图', 'Back to the map')}</span><span class="sm">${tx('星图', 'Map')}</span></button>
        <div class="st-brand"><span class="kicker">${tx('Steam 标签地图', 'Steam tag map')}</span><b>Studio</b></div>
        <div class="st-seg" id="stMode" role="group" aria-label="${tx('模式', 'Mode')}">
          <button type="button" data-m="dev"><span class="lg">${tx('我在做游戏', "I'm making a game")}</span><span class="sm">${tx('做游戏', 'Making')}</span></button>
          <button type="button" data-m="player"><span class="lg">${tx('我在找游戏玩', "I'm looking for a game")}</span><span class="sm">${tx('找游戏', 'Playing')}</span></button></div>
        <div><span class="st-seg-l">${tx('成功 =', 'Success =')}</span><div class="st-seg" id="stSM" role="group">${ST_SM.map(m => `<button type="button" data-k="${m.k}" title="${esc(m.s)}">${m.t}</button>`).join('')}</div></div>
      </header>
      <div class="st-wrap"><nav class="st-steps" id="stSteps"></nav><div id="stBody"></div></div>
      <datalist id="stTags"></datalist>`;
    document.body.appendChild(root);
    $('stBack').onclick = close;
    $('stMode').onclick = e => { const b = e.target.closest('button[data-m]'); if (b && !b.disabled) { S.mode = b.dataset.m; watchDefaults(); if (S.mode === 'dev') fixCombo(); render(); } };
    $('stSM').onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { S.sm = b.dataset.k; render(); } };
    $('stSteps').onclick = e => { const b = e.target.closest('button[data-v]'); if (b && !b.disabled) { S.view = b.dataset.v; render(); root.scrollTop = 0; } };
    root.addEventListener('scroll', hideTip, { passive: true });
    // charts are laid out for the width they were drawn at, so any real width change redraws them (narrowing 500 → 360 too)
    let lastW = innerWidth, rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(innerWidth - lastW) < 24) return; lastW = innerWidth; if (S.open) rerenderKeepingInput(); }, 150); });
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('input')) { e.stopPropagation(); close(); } });   // one Esc: back to the map, selection intact
  }
  function open(opts = {}) {
    if (!root) build();
    if (opts.combo) S.combo = opts.combo.slice();
    if (opts.add && !S.combo.includes(opts.add)) S.combo.push(opts.add);
    if (typeof opts.plans === 'string' && /^[ABC]\d\d(-[ABC]\d\d){0,2}$/.test(opts.plans)) {   // older links have no plan segment and keep the defaults
      const ps = opts.plans.split('-').map((c, i) => ({ name: 'ABC'[i], price: Math.min(+c[1], PRICE_T().length - 1), lt: Math.min(+c[2], LANG_T().length - 1) }));
      S.plans = ps; S.active = Math.min(Math.max(0, +opts.active || 0), ps.length - 1);
    }
    if (opts.view === 'player') S.mode = 'player'; else if (opts.view) { S.view = opts.view; S.mode = 'dev'; }
    S.sm = opts.sm && DEFS[opts.sm] ? opts.sm : DEFS[state.sm] ? state.sm : 'r'; S.open = true;   // the map's year-adjusted 'a' has no Studio twin; Studio adjusts for year itself
    if (!root.contains(document.activeElement)) opener = document.activeElement;
    document.body.classList.add('studio-open'); hideTip();
    if (typeof opts.dims === 'string' && /^(-|[tprg]+)$/.test(opts.dims)) for (const [c, k] of Object.entries(DIM_KEYS)) S.dims[k] = opts.dims.includes(c);
    if ('ptag' in opts) S.ptag = opts.ptag && DB_TAG_OK(opts.ptag) ? opts.ptag : null;
    const explicit = opts.combo || opts.add || opts.seedAppids || opts.seedCover != null || 'ptag' in opts;
    const go = () => { if (!explicit) watchDefaults(); if (S.mode === 'dev') fixCombo(); if (opts.seedAppids) S.seeds = opts.seedAppids.map(rowOfAppid).filter(r => r != null); if (opts.seedCover != null) { const r = rowOfCover(opts.seedCover); S.seeds = r == null ? [] : [r]; } if (explicit) { if (S.mode === 'dev') autoDev = 'link'; else autoPlayer = 'link'; } /* a link's choice is never replaced by the watchlist */ S.pick = null; render(); };
    if (!DB) { $('stBody').innerHTML = `<div class="st-loading">${tx('正在载入 83,353 款游戏…', 'Loading 83,353 games…')}</div>`; setTimeout(() => { db(); if (S.open) go(); }, 30); }
    else go();
    root.focus && root.setAttribute('tabindex', '-1'); root.focus();
  }
  // A link may carry tags that do not exist (a space typed as '+', a renamed tag). Rejoin split names, drop the rest, and say so.
  function fixCombo() {
    const known = new Set(DB.tags), out = [], bad = [], msgs = [], c = S.combo, norm = x => x.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < c.length; i++) {
      if (known.has(c[i])) { out.push(c[i]); continue; }
      let j = i + 1, hit = null;
      for (let name = c[i]; j <= c.length; name += ' ' + (c[j] ?? ''), j++) if (known.has(name)) { hit = name; break; }
      if (hit) { out.push(hit); msgs.push(tx(`链接里的“${esc(c.slice(i, j).join('+'))}”按标签「${esc(hit)}」读取。`, `Read “${esc(c.slice(i, j).join('+'))}” in the link as the tag ${esc(hit)}.`)); i = j - 1; }
      else bad.push(c[i]);
    }
    if (bad.length) {
      const low = bad.map(norm), sug = DB.tags.filter(t => low.some(b => b.length > 2 && norm(t).includes(b))).slice(0, 4);
      msgs.push(tx(`没找到标签：${bad.map(esc).join('、')}，已从组合里去掉。${sug.length ? `是不是：${sug.map(esc).join('、')}？` : ''}`, `No tag called ${bad.map(esc).join(', ')}, so it was left out.${sug.length ? ` Did you mean ${sug.map(esc).join(', ')}?` : ''}`));
    }
    S.combo = [...new Set(out)];
    // the notice stays while the repaired combo is on screen; any change to the combo clears it
    if (msgs.length) S.notice = { key: S.combo.join('|'), html: msgs.join(' ') };   // never cleared here: a reopen from the repaired hash must keep it
  }
  // first open, or nothing edited since Studio last filled things in: start from the watchlist (issue 024)
  function snapAuto() { if (S.mode === 'dev') autoDev = JSON.stringify([S.combo, S.plans]); else autoPlayer = JSON.stringify([S.seeds, S.ptag]); }
  function watchDefaults() {
    const w = watch.get(), devNow = () => JSON.stringify([S.combo, S.plans]);
    if (S.mode === 'dev' && (autoDev === null ? JSON.stringify(S.combo) === JSON.stringify(DEFAULT_COMBO) : devNow() === autoDev)) {
      const t = w.tags.find(DB_TAG_OK); S.combo = t ? [t] : DEFAULT_COMBO.slice(); autoDev = devNow();
    }
    if (S.mode === 'player' && (JSON.stringify([S.seeds, S.ptag]) === autoPlayer || !S.seeds.length && !S.ptag)) {   // an empty picker is never a choice worth keeping
      const rows = w.games.map(rowOfAppid).filter(r => r != null).slice(0, 5), t = w.tags.find(DB_TAG_OK);
      if (rows.length) { S.seeds = rows; S.ptag = null; } else { S.seeds = []; S.ptag = t || null; }
      autoPlayer = JSON.stringify([S.seeds, S.ptag]);
    }
  }
  // a rotation redraws everything; the game search box keeps what was typed, the caret and focus
  function rerenderKeepingInput() {
    const q = $('stQ'), v = q ? q.value : '', had = !!q && document.activeElement === q, at = q ? q.selectionStart : 0;
    render();
    const q2 = $('stQ'); if (!q2 || !v) return;
    q2.value = v; q2.dispatchEvent(new Event('input'));
    if (had) { q2.focus({ preventScroll: true }); try { q2.setSelectionRange(at, at); } catch (e) {} }
  }
  function close() {
    S.open = false; document.body.classList.remove('studio-open'); hideTip();
    if (location.hash.startsWith('#studio')) history.replaceState(null, '', location.pathname + location.search);
    if (opener && opener.isConnected && opener.focus) opener.focus();
    opener = null;
  }
  const DIM_KEYS = { t: 'tags', p: 'price', r: 'rating', g: 'gems' };   // one letter per preference switch in share links
  const dimCode = () => Object.entries(DIM_KEYS).filter(([, k]) => S.dims[k]).map(([c]) => c).join('') || '-';
  function syncHash() { if (S.open) history.replaceState(null, '', S.mode === 'player' ? `#studio/player/${S.seeds.map(r => DB.col.appid[r]).join('+')}/${S.sm}/${encodeURIComponent(S.ptag || '')}/${dimCode()}` : `#studio/${S.view}/${S.combo.map(encodeURIComponent).join('+')}/${S.sm}/${S.plans.map(p => p.name + p.price + p.lt).join('-')}/${S.active}`); }

  function render() {
    if (!DB) return;
    if (S.notice && S.notice.key !== S.combo.join('|')) S.notice = null;   // the link-repair notice only describes the combo it repaired
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
  S.bench = null;
  function benchCard(r) {
    const g = DB.game(r), lane = S.combo.length ? DB.withTags(S.combo) : null, k = def();
    const inLane = !!lane && Array.prototype.includes.call(lane, r), miss = S.combo.filter(t => !g.tags.includes(t));
    let rank = '';
    if (inLane) { const peers = Array.prototype.filter.call(lane, x => DB.col.year[x] === g.y), above = peers.filter(x => DB.col.reviews[x] > g.rv).length, tie = peers.filter(x => DB.col.reviews[x] === g.rv).length > 1, k1 = above + 1;
      rank = tx(`，评价数在同年同赛道 ${fmt(peers.length)} 款里排第 ${fmt(k1)}${tie ? '（并列）' : ''}`, `, #${fmt(k1)}${tie ? ' (tied)' : ''} by reviews of the ${fmt(peers.length)} same-year games in this lane`); }
    const ok = g[k] ? tx('达到当前成功标准', 'meets the current success bar') : tx('未达到当前成功标准', 'below the current success bar');
    return `<div class="st-bench"><b>${esc(g.n)}</b> · ${g.y} · ${fmt(g.rv)} ${tx('条评价', 'reviews')}${rank} · ${pc(g.p, 0)} ${tx('好评', 'positive')} · ${g.c ? money(g.c) : w('免费')} · ${g.nl} ${tx('种语言', 'languages')} · ${ok}${tx('。', '.')}
      ${!S.combo.length ? tx('先选一条赛道，才能和同赛道游戏比较；也可以直接点下面它的标签。', 'Pick a lane to compare it with games in that lane, or start from one of its tags below.') : inLane ? '' : tx(`它不在当前赛道（缺少 ${miss.map(esc).join('、')}）。`, `It is not in this lane (missing ${miss.map(esc).join(', ')}).`)}
      <span class="st-btags">${tx('它的标签：', 'Its tags:')} ${g.tags.slice(0, 8).map(t => S.combo.includes(t) ? `<em>${esc(t)}</em>` : `<button type="button" data-add="${esc(t)}" title="${tx('加入组合', 'Add to the combo')}">+ ${esc(t)}</button>`).join(' ')}</span></div>`;
  }
  function watchedLanes() {
    const w = watch.get(), ts = w.tags.filter(DB_TAG_OK), gs = w.games.map(rowOfAppid).filter(r => r != null);
    if (S.bench != null && !gs.includes(S.bench)) S.bench = null;
    const games = gs.length ? `<div class="st-presets st-watch">${tx('我关注的游戏（对标）：', 'Watched games (benchmarks):')} ${gs.map(r => `<button type="button" data-bench="${r}" class="${S.bench === r ? 'on' : ''}" aria-pressed="${S.bench === r}">${esc(DB.name(r))}</button>`).join('')}</div>${S.bench != null ? benchCard(S.bench) : ''}` : '';
    if (!ts.length) return games;
    return games + `<div class="st-presets st-watch">${tx('我关注的标签：', 'Watched tags:')} ${ts.map(t => `<span class="st-wchip"><button type="button" data-preset="${esc(t)}" title="${tx('换成这条赛道', 'Switch to this lane')}">${esc(t)}</button>${S.combo.includes(t) ? '' : `<button type="button" class="st-wadd" data-add="${esc(t)}" aria-label="${tx('加入组合', 'Add to the combo')} ${esc(t)}" title="${tx('加入当前组合', 'Add to the current combo')}">+</button>`}</span>`).join('')}</div>`;
  }
  function comboBar() {
    return `<div class="st-combo"><span class="lab">${tx('组合', 'Combo')}</span>
      ${S.combo.map(t => `<span class="st-chip" style="--fc:${tagColor(t)}">${esc(t)}<button type="button" data-rm="${esc(t)}" aria-label="${tx('移除', 'Remove')} ${esc(t)}">×</button></span>`).join('')}
      <input id="stAdd" list="stTags" placeholder="${S.combo.length ? tx('+ 再加一个标签', '+ add another tag') : tx('输入一个标签，例如 Card Game', 'Type a tag, e.g. Card Game')}" aria-label="${tx('添加标签', 'Add a tag')}"></div>
      <div class="st-presets">${tx('试试：', 'Try:')} ${PRESETS.map(p => `<button type="button" data-preset="${esc(p.join('|'))}">${esc(p.join(' + '))}</button>`).join('')}</div>${watchedLanes()}`;
  }
  // Two separate judgements, so performance and crowding never contradict each other or the chart.
  const CROWDED = .01;   // >= 1% of a year's new releases (about 125+ games in 2024); the same split as the lane map
  function verdictOf(L) {
    const { all, years, growth } = L, last = years[years.length - 1];
    const perf = all.n < 40 || all.O < 5 ? ['thin', tx('样本太少，难下结论', 'Too few games to judge')]
      : all.hi < 1 ? ['red', tx('低于大盘', 'Below the market')]
      : all.lo > 1 ? ['blue', tx('跑赢大盘', 'Beats the market')] : ['flat', tx('和大盘差不多', 'About the market')];
    // level (share of 2024 releases) plus direction (2022–24 vs 2018–20 average share), so a growing lane never reads as settled
    const dir = growth == null ? tx('新出现', 'newly appearing') : growth >= 2 ? tx('快速变挤', 'filling up fast') : growth >= 1.25 ? tx('在变挤', 'getting busier') : growth <= .8 ? tx('在变空', 'thinning out') : tx('稳定', 'steady');
    // a single tag is crowded or not relative to its faction, exactly as in the shared ocean rule (issue 023);
    // a combo has no peer group, so it uses the fixed line: 1% of a year's new releases
    const o = L.tags.length === 1 && typeof oceans === 'function' ? oceans(def())[L.tags[0]] : null, R = o && o.ref;
    const level = R ? (o.supply >= R.supHi ? 'hi' : o.supply <= R.supLo ? 'lo' : 'mid') : last.share >= CROWDED ? 'hi' : 'lo';
    const crowd = all.n < 40 ? ['thin', tx('游戏太少，看不出拥挤度', 'Too few games to tell crowding')]   // a direction needs games in both periods
      : level === 'hi' ? ['red', tx(`${R ? '同类中拥挤' : '拥挤'} · ${dir}`, `${R ? 'Crowded for its kind' : 'Crowded'} · ${dir}`)]
      : level === 'mid' ? ['flat', tx(`同类中等 · ${dir}`, `Average for its kind · ${dir}`)]
      : [growth == null || growth >= 1.25 ? 'fill' : 'blue', tx(`${R ? '同类中不挤' : '不挤'} · ${dir}`, `${R ? 'Uncrowded for its kind' : 'Uncrowded'} · ${dir}`)];
    return [perf, crowd];
  }
  function laneData(tags) {
    const d = DB, k = def(), rows = d.withTags(tags), scope = d.filter(rows, d.inScope);
    const all = d.oe(rows, k), years = d.laneYears(rows, k), early = d.oe(rows, k, [2018, 2020]), late = d.oe(rows, k, [2022, 2024]);
    const avg = a => a.reduce((s, y) => s + y.share, 0) / a.length;
    const e3 = avg(years.slice(0, 3)), growth = e3 > 0 ? avg(years.slice(-3)) / e3 : null;   // null: nothing to compare against
    return { tags, rows, scope, all, years, early, late, growth, raw: d.rate(scope, k).rate, comp: d.companions(rows, tags, k) };
  }

  // Two plain sentences, one per panel of the trend chart: supply uses the 2018 and 2024 endpoints plus the three-year growth
  // that drives the crowding badge; performance uses the 2018–20 and 2022–24 three-year averages, with their 95% ranges.
  function trendSentences(L) {
    if (L.all.n < 40) return '';
    const y0 = L.years[0], y1 = L.years[L.years.length - 1], g = L.growth, e = L.early, l = L.late;
    const sDir = g >= 1.25 ? tx('越来越挤', 'more crowded') : g <= .8 ? tx('在变空', 'thinning out') : tx('大致持平', 'about level');
    const supply = g == null
      ? tx(`<b>竞争：</b>2018–20 年没有这类新作，算不出增长倍数；2024 年占新作 ${pc(y1.share, 2)}。`, `<b>Competition:</b> no games like this came out in 2018–20, so there is no growth multiple; ${pc(y1.share, 2)} of 2024 releases.`)
      : tx(`<b>竞争：</b>2022–24 年平均新作份额是 2018–20 年的 <b>${g.toFixed(1)} 倍</b>，<b>${sDir}</b>（单看两端：2018 年 ${pc(y0.share, 2)}，2024 年 ${pc(y1.share, 2)}）。`,
        `<b>Competition:</b> the average share of new releases in 2022–24 is <b>${g.toFixed(1)}×</b> that of 2018–20, <b>${sDir}</b> (endpoints: ${pc(y0.share, 2)} in 2018, ${pc(y1.share, 2)} in 2024).`);
    let perf = '';
    if (e.ratio != null && l.ratio != null) {
      // non-overlapping ranges is a conservative reading, not a test of the difference, so overlap is worded as "not clear"
      const apart = e.lo > l.hi || l.lo > e.hi, down = l.ratio < e.ratio;
      const pDir = apart ? (down ? tx('明显下降', 'clearly lower') : tx('明显上升', 'clearly higher'))
        : l.ratio === e.ratio ? tx('两期估计值相同', 'the two estimates are the same')
        : down ? tx('估计值下降，但两期区间重叠，不能确定', 'the estimate is lower, but the two ranges overlap, so it is not clear') : tx('估计值上升，但两期区间重叠，不能确定', 'the estimate is higher, but the two ranges overlap, so it is not clear');
      perf = tx(`<b>表现：</b>相对大盘 2018–20 年 ${times(e.ratio)}（${times(e.lo)}–${times(e.hi)}）→ 2022–24 年 ${times(l.ratio)}（${times(l.lo)}–${times(l.hi)}），<b>${pDir}</b>。`,
        `<b>Performance:</b> vs the market ${times(e.ratio)} in 2018–20 (${times(e.lo)}–${times(e.hi)}) → ${times(l.ratio)} in 2022–24 (${times(l.lo)}–${times(l.hi)}), <b>${pDir}</b>.`);
    }
    return `<ul class="st-reads"><li>${supply}</li>${perf ? `<li>${perf}</li>` : ''}</ul>`;
  }
  // single tags get the map's shared blue / red ocean class, recomputed for the chosen success definition; combos have no peer group
  function oceanBadge() {
    if (S.combo.length !== 1 || typeof oceans !== 'function') return '';
    const t = S.combo[0], o = oceans(def())[t];
    if (!o) return ` <span class="st-verdict flat"><i></i>${tx('不做蓝海 / 红海判断', 'No ocean call')}</span><p class="st-ocwhy">${tx('通用或结果型标签没有同类可比，不判断。', 'Generic and outcome tags have no peer group, so they are not judged.')}</p>`;
    const kind = { blue: 'blue', red: 'red', busy: 'fill', quiet: 'flat', mixed: 'flat', thin: 'thin' }[o.cls];
    const m = S.sm !== 'r' && oceans('hit')[t], diff = m && m.cls !== o.cls
      ? tx(` 星图按“评价 ≥ 500”判断，那里是「${OCEAN[m.cls][1]()}」。`, ` The map judges by 500+ reviews, where it is “${OCEAN[m.cls][1]()}”.`) : '';
    return ` <span class="st-verdict ${kind}"><i></i>${OCEAN[o.cls][1]()}</span><p class="st-ocwhy">${oceanWhy(o, def())}${diff}</p>`;
  }
  function renderLane() {
    const body = $('stBody'), note = S.notice && S.notice.key === S.combo.join('|') ? `<div class="st-notice" role="status">${S.notice.html}</div>` : '';
    if (!S.combo.length) { body.innerHTML = note + comboBar() + `<div class="st-empty">${tx('先选一个标签，看看它的赛道。', 'Pick a tag to see its lane.')}</div>`; wireLane(); $('stAdd').focus(); return; }
    const L = laneData(S.combo), [[pk, pt], [ck, ct]] = verdictOf(L), y0 = L.years[0], y1 = L.years[L.years.length - 1];
    const name = S.combo.map(esc).join('<span class="plus">+</span>');
    const lede = L.all.n === 0 ? tx('2018–2024 年没有同时带这些标签的游戏。', 'No game released 2018–2024 carries all of these tags.') : tx(
      `2018–2024 年共 <b>${fmt(L.all.n)}</b> 款。按发行年份校正后，它们${DEF_TXT[S.sm]}的机会是大盘的 <b>${times(L.all.ratio)}</b>（95% 区间 ${times(L.all.lo)}–${times(L.all.hi)}）。在新游戏里的占比从 2018 年的 <b>${pc(y0.share, 2)}</b> 变成 2024 年的 <b>${pc(y1.share, 2)}</b>${L.early.ratio != null && L.late.ratio != null ? `，优势从 <b>${times(L.early.ratio)}</b>（2018–20）变为 <b>${times(L.late.ratio)}</b>（2022–24）` : ''}。`,
      `<b>${fmt(L.all.n)}</b> games came out 2018–2024. Adjusted for release year, they ${DEF_TXT[S.sm]} <b>${times(L.all.ratio)}</b> as often as the average Steam game (95% range ${times(L.all.lo)}–${times(L.all.hi)}). Their share of new releases went from <b>${pc(y0.share, 2)}</b> in 2018 to <b>${pc(y1.share, 2)}</b> in 2024${L.early.ratio != null && L.late.ratio != null ? `, and the edge moved from <b>${times(L.early.ratio)}</b> (2018–20) to <b>${times(L.late.ratio)}</b> (2022–24)` : ''}.`);
    const kpi = (k, v, d, cls = '') => `<div class="st-kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    body.innerHTML = note + comboBar() + `
      <section class="st-hero"><div>
          <span class="st-verdict ${pk}"><i></i>${pt}</span> <span class="st-verdict ${ck}"><i></i>${ct}</span>${oceanBadge()}
          <h1>${name}</h1><p class="st-lede">${lede}</p></div>
        <div class="st-kpis">
          ${kpi(tx('成功率 vs 大盘（按年份校正）', 'Success vs the market (year-adjusted)'), times(L.all.ratio), tx(`95% 区间 ${times(L.all.lo)}–${times(L.all.hi)} · 1× = 大盘`, `95% range ${times(L.all.lo)}–${times(L.all.hi)} · 1× = market`), 'big')}
          ${kpi(tx('游戏数 2018–24', 'Games 2018–24'), fmt(L.all.n), tx(`其中 ${fmt(L.all.O)} 款成功`, `${fmt(L.all.O)} succeeded`))}
          ${kpi(tx('原始成功率', 'Raw success rate'), pc(L.raw), tx(`大盘 ${pc(mkt())}`, `market ${pc(mkt())}`))}
          ${kpi(tx('2024 年新作占比', 'Share of 2024 releases'), pc(y1.share, 2), y0.share ? tx(`2018 年 ${pc(y0.share, 2)}`, `2018: ${pc(y0.share, 2)}`) : tx('2018 年还没有这类游戏', 'none released in 2018'))}
          ${kpi(tx('2024 年对手', 'Rivals in 2024'), fmt(y1.n), tx('同年发行的同赛道游戏', 'same-lane games released that year'))}
        </div></section>
      <div class="st-grid2">
        <section class="st-card"><h3>${tx('再加一个标签，会落在哪？', 'Add one more tag: where does it land?')}</h3>
          <p class="cap">${tx('每个点 = 当前组合 + 一个常见搭配标签。组合越窄游戏越少，所以点都在圆圈左边；要看的是<b>落得多高</b>（成功率，2018–24，按年份校正）。点击加入组合。', 'Each dot is this combo plus one tag it often appears with. A narrower combo always has fewer games, so every dot sits left of the ring; the question is <b>how high it lands</b> (success, 2018–24, year-adjusted). Click a dot to add it.')}</p>
          <div id="stMap"></div></section>
        <section class="st-card"><h3>${tx('竞争和表现怎么变', 'How competition and performance changed')}</h3>
          ${trendSentences(L)}
          <p class="cap">${tx('柱 = 当年新作中的占比；线 = 当年成功率 vs 大盘，阴影是 95% 区间，游戏少的年份区间更宽。', 'Bars: share of that year\'s new releases. Line: success vs the market that year, with its 95% range shaded; years with few games get wide ranges.')}</p>
          <div id="stTrend"></div></section>
      </div>
      <section class="st-card"><div class="st-hd"><h3>${tx('缩小范围：当前组合 + 一个标签', 'Narrow it down: this combo + one more tag')}</h3>
        <p class="cap">${tx('表现更好的一组按 95% 区间下限从高到低排，更差的一组按区间上限从低到高排，样本少的组合不会因为运气排到前面。', 'Better combos are ranked by the low end of their 95% range, worse ones by the high end, so small lucky (or unlucky) combos do not jump the queue.')}</p></div>
        <div id="stComp"></div></section>
      <section class="st-card"><h3>${tx('评价数分布和商店页做法', 'Review counts and store-page practice')}</h3>
        <div id="stStore"></div>
        <p class="cap">${tx('成功率按这条赛道的发行年份结构校正，和下面“方案”用的是同一种算法。这些都是相关，不是因果：有外部发行商、截图多的游戏往往本来投入就更大。Early Access 是抓取数据时的状态，已经正式发售的游戏不再带这个标记。', 'Success rates are adjusted to this lane\'s mix of release years, the same method the plans use. These are correlations, not causes: games with an outside publisher or many screenshots often had bigger budgets to begin with. Early Access is the status when the data was collected; games that have since fully launched no longer carry it.')}</p></section>
      <section class="st-card"><h3>${tx('这条赛道里被看见的游戏', 'The games that made it in this lane')}</h3>
        <p class="cap">${tx('2018–2024 发行，按评价数排序。', 'Released 2018–2024, by number of reviews.')}</p><div class="st-games" id="stGames"></div></section>
      <div class="st-next"><button class="st-btn pri" type="button" data-go-plan="1">${tx('用这个组合做方案 →', 'Plan a game in this lane →')}</button></div>
      <p class="st-foot">${tx('“按年份校正”：每款游戏和同年发行的全部有标签游戏比较，因为新游戏还没来得及攒评价。所有结果都是相关，不是因果；热门游戏的标签更多，所以细分组合的数值整体偏高，看相对排序更可靠。', '“Year-adjusted”: each game is compared with every tagged game released the same year, because newer games have had less time to collect reviews. Everything here is correlation, not cause. Popular games carry more tags, so narrow combos read high overall; the ranking is more reliable than the absolute value.')}</p>`;
    drawLaneMap(L); drawTrend(L); drawComp(L); drawStore(); drawGames(L);
    wireLane();
  }
  function wireLane() {
    const body = $('stBody');
    body.onclick = e => {
      if (e.target.closest('[data-go-plan]')) { S.view = 'plan'; render(); root.scrollTo({ top: 0 }); return; }
      const bn = e.target.closest('[data-bench]'); if (bn) { S.bench = S.bench === +bn.dataset.bench ? null : +bn.dataset.bench; render(); const b = document.querySelector(`[data-bench="${bn.dataset.bench}"]`); if (b) b.focus(); return; }
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
    syncHash();   // price, languages and plan tabs re-render here without render(), so the share link follows every edit
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
      <div class="st-planhd"><h2>${tx(`在 <b>${name}</b> 里比较方案`, `Comparing plans for <b>${name}</b>`)}</h2>
        <div class="st-presets">${tx('换一条赛道：', 'Another lane:')} ${PRESETS.filter(p => p.join('|') !== S.combo.join('|')).map(p => `<button type="button" data-preset="${esc(p.join('|'))}">${esc(p.join(' + '))}</button>`).join('')} <button type="button" class="st-link" data-go="lane">${tx('自己选…', 'Choose…')}</button></div></div>
      <div class="st-plan">
        <aside class="st-card st-editor">
          <div class="st-tabs" role="tablist">${S.plans.map((p, i) => `<button type="button" role="tab" data-plan="${i}" class="${i === S.active ? 'on' : ''}" style="--pc:${PLAN_COL[i]}"><i></i>${tx('方案', 'Plan')} ${p.name}<small>${est[i].n ? pc(est[i].rate, 0) : '—'}</small></button>`).join('')}
            ${S.plans.length < 3 ? `<button type="button" data-plan="new" class="new">+ ${tx('新方案', 'New')}</button>` : `<button type="button" data-plan="del" class="new" title="${tx('删除当前方案', 'Delete this plan')}">− ${tx('删除', 'Delete')}</button>`}</div>
          <div class="st-f"><div class="st-fl">${tx('赛道', 'Lane')}</div><div class="st-lane">${S.combo.map(t => `<span class="st-chip" style="--fc:${tagColor(t)}">${esc(t)}</span>`).join('')}<button type="button" class="st-link" data-go="lane">${tx('修改', 'Change')}</button></div></div>
          <div class="st-f"><div class="st-fl">${tx('价格', 'Price')}</div><div class="st-pills">${PRICE_T().map((t, j) => `<button type="button" data-price="${j}" class="${pl.price === j ? 'on' : ''}" aria-pressed="${pl.price === j}">${t}</button>`).join('')}</div></div>
          <div class="st-f"><div class="st-fl">${tx('支持几种语言', 'How many languages')}</div><div class="st-pills col">${LANG_T().map((t, j) => `<button type="button" data-lt="${j}" class="${pl.lt === j ? 'on' : ''}" aria-pressed="${pl.lt === j}">${t}<small>${LANG_EX()[j]}</small></button>`).join('')}</div></div>
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
      const t = e.target.closest('[data-plan],[data-price],[data-lt],[data-go],[data-preset]'); if (!t) return;
      if (t.dataset.go) { S.view = t.dataset.go; render(); return; }
      if (t.dataset.preset) { S.combo = t.dataset.preset.split('|'); render(); return; }
      const refocus = sel => { const b = document.querySelector(sel); if (b) b.focus({ preventScroll: true }); };   // keyboard users stay on the pill they chose
      if (t.dataset.price != null) { pl.price = +t.dataset.price; renderPlan(); refocus(`[data-price="${pl.price}"]`); return; }
      if (t.dataset.lt != null) { pl.lt = +t.dataset.lt; renderPlan(); refocus(`[data-lt="${pl.lt}"]`); return; }
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
    const max = Math.min(1, Math.max(.1, ...R.map(r => r.n === 0 ? 0 : (r.hi ?? r.rate ?? 0))) * 1.12), W = narrow ? Math.max(260, Math.floor($('stOdds').clientWidth)) : 640, rowH = 48, m = narrow ? { l: 92, r: 96 } : { l: 175, r: 165 }, H = R.length * rowH + 26;
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
        <text x="${W - m.r + 12}" y="${y - 1}" class="lbl" style="font-size:15px">${pc(r.rate)}${r.plan ? ` <tspan style="font-size:11px;fill:var(--muted);font-weight:400">${tx('估计', 'estimate')}</tspan>` : ''}</text>
        <text x="${W - m.r + 12}" y="${y + 14}">${r.n != null ? tx(`实际 ${fmt(r.hits)}/${fmt(r.n)} 款成功`, `observed ${fmt(r.hits)} of ${fmt(r.n)}`) : ''}${r.plan && r.n < SPARSE ? ' ⚠' : ''}</text>`;
    });
    $('stOdds').innerHTML = s + '</svg>';
  }
  function drawDiff(est, boot) {
    const a = S.active, el = $('stDiff'), others = S.plans.map((_, i) => i).filter(i => i !== a), P = S.plans, pp = v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1);
    if (!others.length) { el.innerHTML = ''; return; }
    el.innerHTML = others.map(o => {
      const A = P[a], O = P[o], lane = esc(S.combo.join(' + '));
      if (!est[a].n || !est[o].n) return tx(`在 ${lane} 里，方案 ${A.name} 或 ${O.name} 没有可比的历史游戏，无法比较。`, `In ${lane}, Plan ${A.name} or ${O.name} has no comparable past games, so they cannot be compared.`);
      if (A.price === O.price && A.lt === O.lt) return tx(`在 ${lane} 里，方案 ${A.name} 和 ${O.name} 落在同一组历史游戏里，数据分不出差别。`, `In ${lane}, Plans ${A.name} and ${O.name} fall into the same group of past games, so the data cannot tell them apart.`);
      const d = est[a].rate - est[o].rate, [lo, hi] = DB.interval(boot, x => x[a + 1] - x[o + 1]), sure = lo > 0 || hi < 0;
      const win = d >= 0 ? A.name : O.name, gap = Math.abs(d), warn = est[a].n < SPARSE || est[o].n < SPARSE ? tx('（有一个方案可比的游戏少于 30 款，结论要打折扣）', ' (one plan has fewer than 30 comparable games, so treat this with care)') : '';
      return sure ? tx(`<b>在 ${lane} 里，方案 ${win} 更好。</b>${A.name} − ${O.name} = <b>${pp(d)} 个百分点</b>（95% 区间 ${pp(lo)} 到 ${pp(hi)}）${warn}。`, `<b>For ${lane}, Plan ${win} looks better.</b> ${A.name} − ${O.name} = <b>${pp(d)} points</b> (95% range ${pp(lo)} to ${pp(hi)})${warn}.`)
        : tx(`<b>在 ${lane} 里，${A.name} 和 ${O.name} 分不出高下。</b>${A.name} − ${O.name} = ${pp(d)} 个百分点，但 95% 区间（${pp(lo)} 到 ${pp(hi)}）跨过了 0${warn}。`, `<b>In ${lane}, no clear winner between ${A.name} and ${O.name}.</b> ${A.name} − ${O.name} = ${pp(d)} points, but the 95% range (${pp(lo)} to ${pp(hi)}) includes zero${warn}.`);
    }).map(t => `<div>${t}</div>`).join('');
  }
  function drawTiers(id, title, B, cur) {
    const W = fitW($(id), 300, 240), H = 180, m = { l: 6, r: 6, t: 26, b: 34 }, n = B.length, step = (W - m.l - m.r) / n;
    const max = Math.max(.1, ...B.filter(b => b.n >= SPARSE).map(b => b.hi), ...B.map(b => b.rate || 0)) * 1.08, Y = v => H - m.b - Math.min(v, max) / max * (H - m.t - m.b);
    let s = `<svg viewBox="0 0 ${W} ${H}"><text x="${m.l}" y="12" class="lbl">${title}</text>`;
    B.forEach((b, j) => {
      const x = m.l + j * step + step * .16, bw = step * .68, thin = b.n < SPARSE, on = j === cur, col = on ? PLAN_COL[S.active] : 'var(--seq1)';
      if (b.rate != null && b.n >= 10) {   // under 10 games the estimate is mostly the lane prior
        s += `<rect x="${x}" y="${Y(b.rate)}" width="${bw}" height="${H - m.b - Y(b.rate)}" rx="3" fill="${col}" opacity="${thin ? .25 : on ? 1 : .6}"><title>${b.t}: ${pc(b.rate)} · ${fmt(b.hits)}/${fmt(b.n)}</title></rect>`;
        if (!thin) s += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${Y(b.lo)}" y2="${Y(b.hi)}" stroke="var(--ink2)" stroke-width="1.2"/>`;
        s += `<text x="${x + bw / 2}" y="${(thin ? Y(b.rate) : Math.min(Y(b.hi), Y(b.rate))) - 5}" text-anchor="middle" class="${on ? 'lbl' : ''}">${pc(b.rate, 0)}</text>`;
      } else s += `<text x="${x + bw / 2}" y="${H - m.b - 6}" text-anchor="middle">${b.n ? tx('太少', 'few') : '—'}</text>`;
      s += `<text x="${x + bw / 2}" y="${H - m.b + 14}" text-anchor="middle" class="${on ? 'lbl' : ''}">${esc(b.t.replace(/ languages?$/, ''))}</text><text x="${x + bw / 2}" y="${H - m.b + 26}" text-anchor="middle">n ${fmt(b.n)}</text>`;
    });
    $(id).innerHTML = s + `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--axis)"/></svg>`;
  }
  function drawHint(ifPrice, ifLang, cur) {
    const pl = S.plans[S.active], el = $('stHint');
    if (!cur.n) { el.innerHTML = tx(`在 ${esc(S.combo.join(' + '))} 里，方案 ${pl.name} 没有可比的历史游戏，先换一个价格档或语言数。`, `In ${esc(S.combo.join(' + '))}, Plan ${pl.name} has no comparable past games yet; try another price tier or number of languages.`); return; }
    // suggest a change only when its paired 95% range of the gain stays above zero
    const best = (B, curJ) => B.filter(b => b.j !== curJ && b.n >= SPARSE && b.dlo > 0).sort((a, b) => b.dlo - a.dlo)[0];
    const bp = best(ifPrice, pl.price), bl = best(ifLang, pl.lt), parts = [], pts = v => (v * 100).toFixed(1);
    const lane = esc(S.combo.join(' + '));
    if (bp) parts.push(tx(`在 ${lane} 里，定价 <b>${bp.t}</b>（语言数相同）的游戏，成功率估计为 <b>${pc(bp.rate)}</b>，比方案 ${pl.name} 高 ${pts(bp.rate - cur.rate)} 个百分点（95% 区间 +${pts(bp.dlo)} 到 +${pts(bp.dhi)}）。`, `${lane} games priced <b>${bp.t}</b> (same number of languages) succeed an estimated <b>${pc(bp.rate)}</b> of the time, ${pts(bp.rate - cur.rate)} points above Plan ${pl.name} (95% range +${pts(bp.dlo)} to +${pts(bp.dhi)}).`));
    if (bl) parts.push(tx(`在 ${lane} 里，支持 <b>${bl.t}</b>（价格档相同）的游戏，成功率估计为 <b>${pc(bl.rate)}</b>，比方案 ${pl.name} 高 ${pts(bl.rate - cur.rate)} 个百分点（95% 区间 +${pts(bl.dlo)} 到 +${pts(bl.dhi)}）。`, `${lane} games supporting <b>${bl.t}</b> (same price tier) succeed an estimated <b>${pc(bl.rate)}</b> of the time, ${pts(bl.rate - cur.rate)} points above Plan ${pl.name} (95% range +${pts(bl.dlo)} to +${pts(bl.dhi)}).`));
    el.innerHTML = parts.length ? `<b>${tx('同类游戏里观察到：', 'Seen among similar games:')}</b> ${parts.join(' ')} <span class="muted">${tx('这是相关关系，不是改了就会达到：定价更高、语言更多的游戏通常预算也更大。', 'This is an association, not a promise: pricier, more localised games also tend to have bigger budgets.')}</span>`
      : tx(`在 ${lane} 里，单改价格或语言数，都没有哪一档能在 95% 区间内明显好过方案 ${pl.name}。`, `In ${lane}, no single change of price or languages clearly beats Plan ${pl.name} within its 95% range.`);
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
  const NEEDS_SEED = new Set(['tags', 'price']);   // with no game entered there is nothing to be similar to; ranking falls back to rating
  const DIMS = () => [
    ['tags', tx('玩法相近', 'Similar gameplay'), tx('标签重合，越少见、越靠前的标签越重要', 'shared tags; rarer and more defining tags count more')],
    ['rating', tx('口碑接近或更好', 'Rated about as well or better'), tx('口碑排名（好评率按评价数修正后）不低于你的游戏就得满分，低得越多扣得越多', 'full marks when its rating rank (positive share adjusted for review count) is at or above your games’, less the further below')],
    ['price', tx('价格相近', 'Similar price'), tx('价位和你玩过的游戏接近', 'priced like the games you played')],
    ['gems', tx('冷门佳作', 'Hidden gems'), tx('好评高、但知道的人不多', 'well rated but not widely known')]];
  const PICK_COL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
  let byAppid = null, byCover = null, recs = [];
  const rowOfAppid = a => { if (!byAppid) { byAppid = new Map(); DB.col.appid.forEach((x, r) => byAppid.set(x, r)); } return byAppid.get(+a); };
  const rowOfCover = i => { db(); if (!byCover) { byCover = new Map(); DB.col.cover.forEach((x, r) => { if (x >= 0 && !byCover.has(x)) byCover.set(x, r); }); } return byCover.get(+i); };
  function watchedSeeds() {
    const w = watch.get(), rows = w.games.map(rowOfAppid).filter(r => r != null), ts = w.tags.filter(DB_TAG_OK);
    if (!rows.length && !ts.length) return '';
    const full = S.seeds.length >= 5;
    return `${rows.length ? `<div class="st-presets st-watch">${tx('我关注的游戏：', 'Watched games:')} ${rows.map(r => `<button type="button" data-wseed="${r}" class="${S.seeds.includes(r) ? 'on' : ''}" aria-pressed="${S.seeds.includes(r)}" title="${S.seeds.includes(r) ? tx('移出', 'Remove') : full ? tx('替换最后一款', 'Replace the last one') : tx('加入', 'Add')}">${esc(DB.name(r))}</button>`).join('')}</div>` : ''}
      ${ts.length ? `<div class="st-presets st-watch">${tx('我关注的标签：', 'Watched tags:')} ${ts.map(t => `<button type="button" data-wtag="${esc(t)}" class="${S.ptag === t ? 'on' : ''}" aria-pressed="${S.ptag === t}" title="${S.ptag === t ? tx('取消只看这个类别', 'Stop limiting to this tag') : tx('只推荐这个类别', 'Only recommend games with this tag')}">${esc(t)}</button>`).join('')}</div>` : ''}`;
  }
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
          ${watchedSeeds()}
          ${S.seeds.length ? '' : `<div class="st-presets">${tx('例如：', 'For example:')} <button type="button" data-example="1">Slay the Spire + Hades + Stardew Valley</button></div>`}</div>
        <div class="st-pcol"><h3><i class="st-n">2</i>${tx('比较时你在意什么？', 'What matters to you?')}</h3>
          <div class="st-dims">${DIMS().map(([k, t, d]) => { const off = !S.seeds.length && NEEDS_SEED.has(k); return `<button type="button" data-dim="${k}" class="${S.dims[k] && !off ? 'on' : ''}" aria-pressed="${!!S.dims[k] && !off}"${off ? ' disabled' : ''}><b>${t}</b><small>${off ? tx('先加一款你玩过的游戏', 'add a game you played first') : d}</small></button>`; }).join('')}</div></div>
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
    const cw = ($('stWhy') || document.body).clientWidth, narrow = cw < 560, W = Math.round(Math.max(260, Math.min(760, narrow ? cw - 30 : cw - 360))), H = 66, m = { l: 10, r: 10 };   // drawn near 1:1 so text stays body-sized
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
      const t = e.target.closest('[data-unseed],[data-dim],[data-pick],[data-example],[data-seed],[data-unptag],[data-wseed],[data-wtag]'); if (!t) return;
      if (t.dataset.wseed) { const r = +t.dataset.wseed, i = S.seeds.indexOf(r);   // toggle; when five are chosen, replace the last
        if (i >= 0) S.seeds.splice(i, 1); else if (S.seeds.length >= 5) S.seeds[4] = r; else S.seeds.push(r); render(); return; }
      if (t.dataset.wtag) { S.ptag = S.ptag === t.dataset.wtag ? null : t.dataset.wtag; render(); return; }
      if (t.dataset.unptag) { S.ptag = null; render(); return; }
      if (t.dataset.unseed) { S.seeds = S.seeds.filter(r => r !== +t.dataset.unseed); render(); const q = $('stQ'); if (q) q.focus(); return; }
      else if (t.dataset.dim) { const k = t.dataset.dim; S.dims[k] = !S.dims[k]; render(); const b = document.querySelector(`[data-dim="${k}"]`); if (b) b.focus(); return; }
      else if (t.dataset.pick) { S.pick = +t.dataset.pick; renderPlayerPick(); const b = document.querySelector(`[data-pick="${S.pick}"]`); if (b) b.focus({ preventScroll: true }); return; }
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
  // a chart designed W0 wide is redrawn at the host's width when the host is narrower, instead of being scaled down
  const fitW = (host, W0, min = 260) => { const cw = host ? host.clientWidth : 0; return cw && cw < W0 ? Math.max(min, Math.floor(cw)) : W0; };
  function drawLaneMap(L) {
    const W = fitW($('stMap'), 560), narrow = W < 460, H = narrow ? 340 : 380, m = { l: narrow ? 34 : 46, r: narrow ? 10 : 18, t: 14, b: 40 };
    const pts = L.comp.slice().sort((a, b) => b.n - a.n).slice(0, 45).filter(c => c.lastShare > 0);
    const me = { tag: null, lastShare: L.years[L.years.length - 1].share, ratio: L.all.ratio, n: L.all.n };
    if (!pts.length || !me.ratio) { $('stMap').innerHTML = `<div class="st-empty">${tx('这个组合的搭配标签太少。', 'Too few companion tags for this combo.')}</div>`; return; }
    const xs = [...pts.map(p => p.lastShare), me.lastShare].filter(v => v > 0), ys = [...pts.map(p => p.ratio), me.ratio];
    const x0 = Math.log10(Math.min(...xs) * .7), x1 = Math.log10(Math.max(...xs, .012) * 1.4), yMax = Math.min(8, Math.max(2, ...ys) * 1.08);
    const X = v => m.l + (Math.log10(Math.max(v, 10 ** x0)) - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => H - m.b - Math.min(v, yMax) / yMax * (H - m.t - m.b);
    const xs1 = X(.01), y1 = Y(1);
    let s = svgOpen(W, H) + `<rect x="${m.l}" y="${m.t}" width="${Math.max(0, xs1 - m.l)}" height="${y1 - m.t}" fill="rgba(57,135,229,.08)"/>
      <rect x="${xs1}" y="${y1}" width="${Math.max(0, W - m.r - xs1)}" height="${H - m.b - y1}" fill="rgba(230,103,103,.08)"/>
      <text x="${m.l + 8}" y="${m.t + 16}" style="fill:#8fbaf0;font-weight:600">${narrow ? tx('不挤、跑赢', 'Uncrowded, ahead') : tx('不挤、跑赢大盘', 'Uncrowded, beats the market')}</text>
      <text x="${W - m.r - 8}" y="${H - m.b - 8}" text-anchor="end" style="fill:#f09a9a;font-weight:600">${narrow ? tx('拥挤、落后', 'Crowded, behind') : tx('拥挤、低于大盘', 'Crowded, below the market')}</text>
      <line x1="${m.l}" x2="${W - m.r}" y1="${y1}" y2="${y1}" stroke="var(--ink2)" stroke-dasharray="4 4"/><text x="${W - m.r - 4}" y="${y1 - 5}" text-anchor="end" class="note">1× = ${tx('大盘', 'market')}</text>
      <line x1="${xs1}" x2="${xs1}" y1="${m.t}" y2="${H - m.b}" stroke="var(--axis)" stroke-dasharray="2 4"/>`;
    for (const v of narrow ? [.001, .01, .1] : [.0005, .001, .002, .005, .01, .02, .05, .1]) { const x = X(v); if (Math.log10(v) >= x0 && Math.log10(v) <= x1) s += `<text x="${x}" y="${H - m.b + 16}" text-anchor="middle">${pc(v, v < .01 ? 1 : 0)}</text>`; }
    for (let v = 0; v <= yMax; v += yMax > 5 ? 2 : 1) s += `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v}×</text>`;
    s += `<text x="${W - m.r}" y="${H - 4}" text-anchor="end">${narrow ? tx('2024 新作占比 →', '2024 release share →') : tx('2024 年新作中的占比（对数）→', 'share of 2024 releases (log) →')}</text>`;
    // priority: best three by the low end of the range, then the five with most games (the tags people look for), then the two worst
    const order = [...[...pts].sort((a, b) => b.lo - a.lo).slice(0, 3), ...[...pts].sort((a, b) => b.n - a.n).slice(0, 5), ...[...pts].sort((a, b) => a.ratio - b.ratio).slice(0, 2)];
    const lab = new Map(); order.forEach((p, i) => { if (!lab.has(p.tag)) lab.set(p.tag, i); });
    const r = n => Math.min(14, 3 + Math.sqrt(n) / 2.4), mx = X(me.lastShare), my = Y(me.ratio), mr = Math.min(18, r(me.n) + 3);
    // labels: best first, skipped when they would collide with one already placed (or with the zone titles)
    const zw = narrow ? 120 : 200, boxes = [[m.l, m.t, m.l + zw, m.t + 22], [W - m.r - zw, H - m.b - 22, W - m.r, H - m.b], [mx - 50, my - mr - 24, mx + 50, my - mr - 4]];
    const free = b => !boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    let labels = '';
    for (const p of pts.filter(p => lab.has(p.tag)).sort((a, b) => lab.get(a.tag) - lab.get(b.tag))) {
      const cx = X(p.lastShare), cy = Y(p.ratio), tw = 7 * (p.tag.length + 2), rr = r(p.n) + 4;
      const R = [cx + rr, cy - 8, cx + rr + tw, cy + 6], Lb = [cx - rr - tw, cy - 8, cx - rr, cy + 6];
      const fitsR = R[2] < W - m.r, fitsL = Lb[0] > m.l;
      const bx = [fitsR && R, fitsL && Lb].find(b => b && free(b)); if (!bx) continue;
      const right = bx === R;
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
    const W = fitW($('stTrend'), 560), narrow = W < 460, H = narrow ? 340 : 380, m = { l: narrow ? 36 : 46, r: narrow ? 10 : 18, t: 16, b: 30 }, ys = L.years, n = ys.length, gap = 26;
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
      s += `${!narrow || i % 2 === 0 || i === n - 1 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${narrow ? "'" + String(y.y).slice(2) : y.y}</text>` : ''}<rect x="${X(i) - step / 2}" y="${m.t}" width="${step}" height="${H - m.b - m.t}" fill="transparent" data-i="${i}"/>`; });
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
      <div class="c c-bar" style="display:flex;align-items:center;gap:8px"><div style="flex:1">${bar(c)}</div><b style="font-variant-numeric:tabular-nums;width:44px;text-align:right">${times(c.ratio)}</b></div>
      <div class="c num c-rel">${P ? rel(c) : '—'}</div><div class="c num c5">${fmt(c.last)}</div></div>`;
    const head = `<div class="h"></div><div class="h">${tx('当前组合 +', 'Current combo +')}</div><div class="h num">${tx('游戏', 'Games')}</div><div class="h c-bar">${tx('成功率 vs 大盘（细线 = 95% 区间，黑线 = 当前组合）', 'Success vs market (thin line = 95% range, tick = current combo)')}</div><div class="h num c-rel">${tx('vs 当前', 'vs current')}</div><div class="h num c5">${tx('2024 新作', '2024 releases')}</div>`;
    $('stComp').innerHTML = (better.length ? `<div class="st-sub" style="margin-top:4px">${tx('比当前组合更好', 'Better than the current combo')}</div><div class="st-comp">${head}${better.map(rowH).join('')}</div>` : `<div class="st-empty" style="padding:24px 0">${tx('没有哪个搭配明显更好：当前组合已经很窄了。', 'No narrower combo does better: this one is already sharp.')}</div>`) +
      (worse.length ? `<div class="st-sub">${tx('会拖后腿的搭配', 'Tags that drag it down')}</div><div class="st-comp">${head}${worse.map(rowH).join('')}</div>` : '');
  }
  // ---------- review-count spread and store-page practice (issue 007) ----------
  let mktRv = null;
  function drawStore() {
    const el = $('stStore'); if (!el) return;
    const k = def(), inScope = r => DB.col.year[r] >= DB.scope[0] && DB.col.year[r] <= DB.scope[1];
    const rows = Array.prototype.filter.call(DB.withTags(S.combo), inScope);
    if (!mktRv) mktRv = Array.prototype.filter.call(DB.all(), inScope).map(r => DB.col.reviews[r]);
    const qs = a => [.5, .75, .9].map(q => GameDB.quantile(a, q));
    const [a50, a75, a90] = qs(rows.map(r => DB.col.reviews[r])), [m50, m75, m90] = qs(mktRv), f = v => v == null ? '—' : fmt(Math.round(v));
    const spread = tx(`评价数（2018–24 发行）：中位数 <b>${f(a50)}</b> 条，第 75 百分位 <b>${f(a75)}</b> 条，第 90 百分位 <b>${f(a90)}</b> 条。全部有标签的游戏分别是 ${f(m50)}、${f(m75)}、${f(m90)} 条。`,
      `Reviews (released 2018–24): median <b>${f(a50)}</b>, 75th percentile <b>${f(a75)}</b>, 90th percentile <b>${f(a90)}</b>. For all tagged games: ${f(m50)}, ${f(m75)}, ${f(m90)}.`);
    const all = DB.cohort(rows, null, k);
    const has = DB.storeCols || {}, groups = [
      [tx('发行方式', 'Publishing'), [[tx('自己发行', 'Self-published'), r => DB.pubType(r) === 1], [tx('有外部发行商', 'Outside publisher'), r => DB.pubType(r) === 2]]],
      [tx('商店截图', 'Screenshots'), [[tx('少于 10 张', 'Under 10'), r => DB.shots(r) < 10], [tx('10–19 张', '10–19'), r => DB.shots(r) >= 10 && DB.shots(r) < 20], [tx('20 张以上', '20 or more'), r => DB.shots(r) >= 20]]],
      [tx('Early Access（抓取时）', 'Early Access (at collection)'), [[tx('仍在 Early Access', 'Still in Early Access'), r => DB.earlyAccess(r)], [tx('不在', 'Not in it'), r => !DB.earlyAccess(r)]]],
    ].filter((_, i) => [has.pub, has.shots, has.ea][i]);
    const missing = 3 - groups.length;
    const MIN = 30, hi = Math.max(.05, ...groups.flatMap(([, gs]) => gs.map(([, p]) => { const c = DB.cohort(rows, p, k); return c.n >= MIN ? c.hi : 0; })), all.hi || 0);
    const bar = c => { const x = v => (v / hi * 100).toFixed(1) + '%';
      return `<span class="st-sbar"><i class="ci" style="left:${x(c.lo)};width:calc(${x(c.hi)} - ${x(c.lo)})"></i><i class="pt" style="left:${x(c.rate)}"></i><i class="ln" style="left:${x(all.rate)}"></i></span>`; };
    let t = `<div class="st-store" role="table"><div class="h" role="row"><span role="columnheader">${tx('分组', 'Group')}</span><span role="columnheader" class="num">${tx('游戏数', 'Games')}</span><span role="columnheader" class="num">${tx('成功率', 'Success')}</span><span role="columnheader">${tx('95% 区间（竖线 = 整条赛道）', '95% range (line = whole lane)')}<small style="margin-left:auto">${tx('刻度', 'scale')} 0–${pc(hi)}</small></span></div>`;
    for (const [gname, gs] of groups) {
      t += `<div class="g" role="row"><span role="cell">${gname}</span></div>`;
      for (const [label, p] of gs) {
        const c = DB.cohort(rows, p, k), few = c.n < MIN;
        t += `<div class="r${few ? ' few' : ''}" role="row"><span role="cell">${label}</span><span role="cell" class="num">${fmt(c.n)}</span><span role="cell" class="num">${few ? tx('样本少', 'too few') : pc(c.rate)}</span><span role="cell">${few ? '' : bar(c) + `<small>${pc(c.lo)}–${pc(c.hi)}</small>`}</span></div>`;
      }
    }
    t += `<div class="r all" role="row"><span role="cell"><b>${tx('整条赛道', 'Whole lane')}</b></span><span role="cell" class="num">${fmt(all.n)}</span><span role="cell" class="num">${all.rate == null ? '—' : pc(all.rate)}</span><span role="cell">${all.rate == null ? '' : bar(all) + `<small>${pc(all.lo)}–${pc(all.hi)}</small>`}</span></div></div>`;
    el.innerHTML = `<p class="st-spread">${spread}</p>${t}${missing ? `<p class="cap">${tx('这份数据缺少部分商店页字段，相应分组没有列出。', 'This data file lacks some store-page fields, so those groups are left out.')}</p>` : ''}`;
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
  // ---------- map panel, a tag selected (issue 022): one checkable observation and two year-aligned charts ----------
  function drawTagFirst() {
    const box = $('tagFirst'); if (!box) return;
    const t = state.locked, show = !!(t && !state.game && T[t]);
    box.style.display = show ? '' : 'none'; if (!show) { box.innerHTML = ''; return; }
    const d = db(), ys = d.laneYears(d.withTags([t]), 'hit'), mk = d.market('hit');
    const per = y => y.n ? y.O / y.n : null, mper = y => mk.rate[y.y];
    const avg = (a, f) => { const v = a.map(f).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const pool = a => { const n = a.reduce((s, y) => s + y.n, 0), o = a.reduce((s, y) => s + y.O, 0), m = a.reduce((s, y) => s + mk.rate[y.y] * y.n, 0); return { n, r: n ? o / n : null, m: n ? m / n : null }; };
    const e = ys.slice(0, 3), l = ys.slice(-3), se = avg(e, y => y.share), sl = avg(l, y => y.share), g = se ? sl / se : null;
    const pe = pool(e), pl = pool(l), p100 = v => v == null ? '—' : (v * 100).toFixed(v < .1 ? 1 : 0);
    const dir = g == null ? tx('早年没有这类新作', 'none released early on') : g >= 1.25 ? tx('上升', 'rising') : g <= .8 ? tx('下降', 'falling') : tx('大致持平', 'about level');
    const vs = (r, m) => r == null || m == null ? '' : r > m * 1.1 ? tx('高于', 'above') : r < m * .9 ? tx('低于', 'below') : tx('接近', 'close to');
    const thin = pe.n < 40 || pl.n < 40;
    const both = vs(pe.r, pe.m) && vs(pe.r, pe.m) === vs(pl.r, pl.m);
    const obs = tx(`2022–24 年，${esc(t)} 占有标签新作的年均份额是 2018–20 年的 <b>${g == null ? '—' : g.toFixed(1) + ' 倍'}</b>（${dir}）。每百款达到 500 条评价的从 <b>${p100(pe.r)}</b> 款变为 <b>${p100(pl.r)}</b> 款，${both ? `两期都${vs(pl.r, pl.m)}同年大盘` : `2018–20 年${vs(pe.r, pe.m)}、2022–24 年${vs(pl.r, pl.m)}同年大盘`}（约 ${p100(pe.m)} 款、${p100(pl.m)} 款）。${thin ? '其中一段少于 40 款，数字只作参考。' : ''}较晚发行的游戏攒评价的时间短，请比较同一年实线和虚线的差距。`,
      `In 2022–24, ${esc(t)} averaged <b>${g == null ? '—' : g.toFixed(1) + '×'}</b> its 2018–20 share of tagged new releases (${dir}). Per 100 games, those reaching 500 reviews went from <b>${p100(pe.r)}</b> to <b>${p100(pl.r)}</b>, ${both ? `${vs(pl.r, pl.m)} the same-year market both times` : `${vs(pe.r, pe.m)} the same-year market in 2018–20 and ${vs(pl.r, pl.m)} it in 2022–24`} (about ${p100(pe.m)} and ${p100(pl.m)}).${thin ? ' One period has under 40 games, so treat these as rough.' : ''} Later releases have had less time to collect reviews, so compare the solid and dashed lines within each year.`);
    // two panels, one year axis; lines are labelled at their ends, so nothing depends on a colour key
    const W = Math.max(220, Math.min(520, Math.floor(box.clientWidth - 28 || 460))), m = { l: 8, r: 64, t: 18 }, h = 70, gap = 34, H = m.t + h + gap + h + 40;
    const n = ys.length, X = i => m.l + (W - m.l - m.r) * (i + .5) / n;
    const sMax = Math.max(...ys.map(y => y.share)) * 1.2 || 1, Y1 = v => m.t + h - v / sMax * h;
    const rv = ys.flatMap(y => [per(y), mper(y)]).filter(v => v != null), rMax = Math.max(...rv) * 1.2 || 1, top2 = m.t + h + gap, Y2 = v => top2 + h - v / rMax * h;
    const path = (f, Y) => { let s = '', on = false; ys.forEach((y, i) => { const v = f(y); if (v == null) { on = false; return; } s += `${on ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; on = true; }); return s; };
    const last = ys[n - 1], lastP = per(last), narrowN = (W - m.l - m.r) / n < 52, kfmt = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(v);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t)}">`;
    s += `<text x="${m.l}" y="${m.t - 6}" class="tf-h">${tx('新作份额（占当年有标签的新作）', 'Share of each year\'s tagged new releases')}</text>`;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + h}" y2="${m.t + h}" class="tf-ax"/><path d="${path(y => y.share, Y1)}" class="tf-ln"/>`;
    ys.forEach((y, i) => { s += `<circle cx="${X(i)}" cy="${Y1(y.share)}" r="2.6" class="tf-pt"/>`; });
    s += `<text x="${X(n - 1) + 8}" y="${Y1(last.share) + 4}" class="tf-v">${pct(last.share, 2)}</text><text x="${X(0)}" y="${Y1(ys[0].share) - 7}" text-anchor="middle" class="tf-s">${pct(ys[0].share, 2)}</text>`;
    s += `<text x="${m.l}" y="${top2 - 6}" class="tf-h">${tx('每百款达到 500 条评价', 'Per 100 games reaching 500 reviews')}</text>`;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${top2 + h}" y2="${top2 + h}" class="tf-ax"/><path d="${path(mper, Y2)}" class="tf-mk"/><path d="${path(per, Y2)}" class="tf-ln"/>`;
    ys.forEach((y, i) => { const v = per(y); if (v != null) s += `<circle cx="${X(i)}" cy="${Y2(v)}" r="2.6" class="tf-pt"/>`; });
    if (lastP != null) s += `<text x="${X(n - 1) + 8}" y="${Y2(lastP) + 4}" class="tf-v">${p100(lastP)}</text>`;
    const my = Y2(mper(last)), ty = lastP == null ? -99 : Y2(lastP);
    s += `<text x="${X(n - 1) + 8}" y="${(Math.abs(my - ty) < 13 ? (my > ty ? ty + 14 : ty - 12) : my) + 4}" class="tf-s">${tx('大盘', 'market')} ${p100(mper(last))}</text>`;
    ys.forEach((y, i) => { s += `<text x="${X(i)}" y="${top2 + h + 15}" text-anchor="middle" class="tf-s">${n > 6 && W < 340 ? "'" + String(y.y).slice(2) : y.y}</text><text x="${X(i)}" y="${top2 + h + 29}" text-anchor="middle" class="tf-n">${narrowN ? kfmt(y.n) : 'n ' + fmt(y.n)}</text>`; });
    s += '</svg>';
    box.innerHTML = `<p class="tf-obs">${obs}</p>${s}<p class="tf-key">${tx('实线 = 该标签，虚线 = 同年全部有标签的新作（大盘）；最下面一行（n）= 当年该标签的新作数。', 'Solid: this tag. Dashed: all tagged new games that year (the market). Bottom row (n): this tag\'s new games that year.')}</p>`;
  }
  // what the map's watch button acts on: ['games', appid] for a selected game, ['tags', name] for a selected tag
  function watchTarget() {
    if (!state.locked) return null;
    if (state.game) { const r = rowOfCover(state.game.i); return r == null ? null : ['games', DB.col.appid[r]]; }
    return DB_TAG_OK(state.locked) ? ['tags', state.locked] : null;
  }
  // ---------- first screen (issue 026): real covers and the tags they actually share ----------
  // A static picture, so it needs no motion setting and works offline (covers are embedded). Hits and a small game side by side.
  const INTRO_GAMES = ['Hades', 'Vampire Survivors', 'Slay the Spire', 'Balatro', 'Dicey Dungeons', 'Cobalt Core'];
  function drawCovers(box) {
    const d = db(), narrow = innerWidth < 560;
    const want = narrow ? ['Hades', 'Vampire Survivors', 'Slay the Spire', 'Cobalt Core'] : INTRO_GAMES;
    const rows = want.map(n => d.search(n, 1)[0]).filter(r => r != null && d.game(r).i != null), gs = rows.map(r => d.game(r));
    // a fixed example set of tags; every line comes from the game's own tag list, so nothing drawn is invented
    const want_t = narrow ? ['Action Roguelike', 'Rogue-lite', 'Roguelike Deckbuilder'] : ['Action Roguelike', 'Rogue-lite', 'Roguelike Deckbuilder', 'Card Game'];
    let tags = want_t.filter(t => DB_TAG_OK(t) && gs.filter(g => g.tags.includes(t)).length >= 2);
    box.hidden = false;   // measure the laid-out width (a hidden box reads 0, e.g. after turning a phone back to portrait)
    const cx = (i, n, W) => W * (i + .5) / n, W = box.clientWidth || Math.min(900, innerWidth - 32);
    const tx0 = t => { const xs = gs.map((g, i) => g.tags.includes(t) ? cx(i, gs.length, W) : null).filter(v => v != null); return xs.reduce((a, b) => a + b, 0) / xs.length; };
    tags = tags.sort((a, b) => tx0(a) - tx0(b));
    // covers fit the width; on phones the names go (the cover art shows them, and alt text carries them) to keep the headline clear
    const cw = Math.min(118, Math.floor(W / gs.length) - 10), ch = Math.round(cw * 215 / 460);
    const top = ch + (narrow ? 18 : 46), tagY = top + (narrow ? 22 : 56), capY = narrow ? tagY + 24 : -26, bottom = narrow ? capY + 16 : tagY + 28;
    box.style.setProperty('--cov-w', cw + 'px');
    const head = document.querySelector('#story .beat p'), hr = head && head.getBoundingClientRect();
    const limit = (hr && hr.height ? hr.top : innerHeight * .45) - 12 - box.getBoundingClientRect().top;   // keep clear of the headline
    box.hidden = !gs.length || bottom > limit;
    if (box.hidden) return;
    const k = v => v >= 1e4 ? tx(`${(v / 1e4).toFixed(v >= 1e5 ? 0 : 1)} 万`, `${Math.round(v / 1000)}k`) : narrow && v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmt(v);
    let svg = `<svg class="st-clines" width="${W}" height="${tagY + 4}" aria-hidden="true">`;
    gs.forEach((g, i) => tags.forEach((t, j) => { if (g.tags.includes(t)) svg += `<line data-g="${g.i}" data-t="${esc(t)}" x1="${cx(i, gs.length, W)}" y1="${top}" x2="${cx(j, tags.length, W)}" y2="${tagY}"/>`; }));
    svg += '</svg>';
    box.style.height = bottom + 'px';
    box.innerHTML = `<p class="st-ccap" style="top:${capY}px">${narrow ? tx('示例：这些游戏实际共有的标签', 'Examples: tags these games actually share') : tx('示例：几款游戏和它们实际共有的标签。星图里的每个球就是这样一个标签。', 'Examples: a few games and the tags they actually share. Each ball on the map is one such tag.')}</p>${svg}
      ${gs.map((g, i) => `<button type="button" class="st-cov" data-cov="${g.i}" style="left:${cx(i, gs.length, W)}px" aria-label="${esc(g.n)}: ${tx('找与它相似的游戏', 'find games like this one')}" title="${esc(g.n)} · ${tx('找与它相似的游戏', 'Find games like this one')}"><img src="${coverSrc(g.i)}" alt="${esc(g.n)}">${narrow ? '' : `<b>${esc(g.n)}</b>`}<small>${k(g.rv)} ${tx('评价', 'reviews')}</small></button>`).join('')}
      ${tags.map((t, j) => `<span class="st-ctag" style="left:${cx(j, tags.length, W)}px;top:${tagY}px">${esc(t)}</span>`).join('')}`;
    box.onclick = e => { const b = e.target.closest('[data-cov]'); if (b) open({ view: 'player', seedCover: +b.dataset.cov, ptag: null }); };
  }
  function init() {
    // entry points: the world-select screen and the map toolbar both offer the two tasks by name
    const entry = (cls, id, label, opts) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.id = id; b.innerHTML = label; b.onclick = () => open(opts); return b; };
    const acts = document.querySelector('#ui3 .acts');
    if (acts) { acts.prepend(entry('ghost', 'studioFind', tx('找游戏玩', 'Find a game'), { view: 'player' })); acts.prepend(entry('ghost', 'studioBtn', tx('做一款游戏', 'Plan a game'), { view: 'lane' })); }
    // The two tasks, worded by what each person takes away (issue 015). Both groups share one layout (issue 025).
    const DEV = () => `<b>${tx('规划我的游戏 →', 'Plan my game →')}</b><small>${tx('看同类竞争有多激烈，比较不同价格档和支持语言数的历史成功率', 'see how crowded a lane is and compare past success by price tier and number of languages')}</small>`;
    const PLAYER = () => `<b>${tx('找下一款游戏 →', 'Find my next game →')}</b><small>${tx('输入喜欢的游戏，看推荐和每款的推荐理由', 'add games you like to get picks and why each one fits')}</small>`;
    const roles = (idDev, idPlayer) => { const box = document.createElement('div'); box.className = 'st-entry';
      box.append(entry('st-ent', idDev, DEV(), { view: 'lane' }), entry('st-ent', idPlayer, PLAYER(), { view: 'player' })); return box; };
    // first act of the intro: visible without scrolling, fades out once the story starts
    const stage = document.querySelector('#story .stage');
    if (stage) {
      const first = document.createElement('div'); first.className = 'st-first'; first.id = 'stFirst';
      first.innerHTML = `<h2>${tx('从一款你感兴趣的游戏开始', 'Start from a game you care about')}</h2><p>${tx('选今天想做的事，或者先看看 Steam 的标签星图。', 'Pick what you want to do today, or look around the Steam tag map first.')}</p>`;
      first.append(roles('stFirstDev', 'stFirstPlayer'));
      const look = document.createElement('button'); look.type = 'button'; look.className = 'st-look'; look.id = 'stFirstMap';
      look.textContent = tx('先看开场和星图 ↓', 'Watch the intro and map first ↓');
      look.onclick = () => scrollTo({ top: innerHeight * .9, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      first.append(look); stage.append(first);
      const covers = document.createElement('div'); covers.className = 'st-covers'; covers.id = 'stCovers'; stage.append(covers);
      const drawC = () => drawCovers(covers); requestAnimationFrame(drawC);
      let ct = 0; addEventListener('resize', () => { clearTimeout(ct); ct = setTimeout(drawC, 150); });
      const fade = () => { const gone = scrollY > innerHeight * .35; first.classList.toggle('gone', gone); covers.classList.toggle('gone', gone); stage.classList.toggle('st-firston', !gone); };
      addEventListener('scroll', fade, { passive: true }); fade();
    }
    // role selection area: the same two cards come first, above the world picker
    const sel = document.querySelector('#select .selhead');
    if (sel) { const box = roles('stEntryDev', 'stEntryPlayer'); box.classList.add('st-entry-sel'); sel.prepend(box); }
    const hinfo = document.querySelector('.hinfo');
    if (hinfo) {
      const box = document.createElement('div'); box.className = 'st-hacts';
      box.innerHTML = `<button class="st-btn st-wbtn" type="button" id="watchBtn" aria-pressed="false"></button><button class="st-btn" type="button" id="toFind"></button><button class="st-btn pri" type="button" id="toLane"></button>`;
      hinfo.appendChild(box);
      $('toLane').onclick = () => state.locked && open({ combo: [state.locked], view: 'lane' });
      // one button: the selected game if there is one, otherwise the tag. Viewing never adds to the list; only this does.
      $('watchBtn').onclick = () => { const k = watchTarget(); if (k) { watch.toggle(k[0], k[1]); sync(); } };
      $('toFind').onclick = () => { if (!state.locked) return; if (state.game) open({ view: 'player', seedCover: state.game.i, ptag: null }); else open({ view: 'player', ptag: state.locked }); };
      const v = document.getElementById('verdict'), gp = document.createElement('section'); gp.id = 'gpos'; gp.className = 'gpos'; v.parentNode.insertBefore(gp, v);
      const tf = document.createElement('section'); tf.id = 'tagFirst'; tf.className = 'tfirst'; v.parentNode.insertBefore(tf, v.nextSibling);
    }
    const sync = () => {
      drawTagFirst();
      const t = state.locked, gsel = !!(t && state.game), L = $('toLane'), F = $('toFind');
      // phones get short labels so the actions take one or two rows; the full wording stays in the title and the accessible name
      const short = innerWidth <= 560, label = (b, full, brief) => { b.textContent = short ? brief : full; b.title = full; };
      if (L) { L.parentElement.style.display = t ? '' : 'none'; label(L, tx(`分析「${t}」的市场 →`, `Analyse the ${t} market →`), tx('分析市场 →', 'Analyse market →')); }
      if (F) label(F, gsel ? tx('找与这款相似的游戏 →', 'Find games like this one →') : tx(`找「${t}」里的好游戏 →`, `Find ${t} games to play →`), gsel ? tx('找相似的 →', 'Find similar →') : tx('找游戏 →', 'Find games →'));
      const Wb = $('watchBtn'), k = watchTarget();
      if (Wb) { const on = !!k && watch.has(k[0], k[1]); Wb.style.display = k ? '' : 'none'; Wb.setAttribute('aria-pressed', on);
        const full = on ? (gsel ? tx('★ 已关注这款游戏', '★ Watching this game') : tx('★ 已关注这个标签', '★ Watching this tag')) : (gsel ? tx('☆ 关注这款游戏', '☆ Watch this game') : tx('☆ 关注这个标签', '☆ Watch this tag'));
        Wb.textContent = innerWidth <= 560 ? (on ? tx('★ 已关注', '★ Watching') : tx('☆ 关注', '☆ Watch')) : full; Wb.title = full; }
      drawGamePos();
    };
    let syncT = 0; addEventListener('resize', () => { clearTimeout(syncT); syncT = setTimeout(sync, 150); });   // short labels on phones follow rotation
    for (const fn of ['lock', 'refreshSel', 'clearGame', 'drawKpis']) {   // keep the panel in step with every change of selection
      const orig = window[fn]; if (typeof orig !== 'function') continue;
      window[fn] = function (...a) { const r = orig.apply(this, a); sync(); return r; };
    }
    sync();
    if (location.hash.startsWith('#studio/')) {
      const [, view, tags, sm] = location.hash.slice(1).split('/');
      if (view === 'player') { const [pt, dc] = location.hash.slice(1).split('/').slice(4); open({ view, sm, dims: dc, seedAppids: tags ? tags.split('+').filter(Boolean) : [], ptag: pt ? decodeURIComponent(pt) : null }); }
      else { const [pls, act] = location.hash.slice(1).split('/').slice(4); open({ view: view || 'lane', sm, plans: pls, active: act, combo: tags ? tags.split('+').map(decodeURIComponent).filter(Boolean) : [] }); }
    }
  }
  return { init, open, close, state: S, watch, db };
})();
Studio.init();
