/* In-page end-to-end checks. scripts/e2e.py appends this to a copy of the built page, runs headless Chrome with
   --dump-dom and reads the results from the pre element it appends. It drives the real UI with clicks and key events. */
(async () => {
  const out = [], wait = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const errors = []; addEventListener('error', e => errors.push(e.message));
  const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await wait(50); } return false; };
  try {
    ok(!!$('#stEntryPlayer') && !!$('#stEntryDev') && !!$('#studioFind'), 'entry: both tasks are offered on the world screen and the map toolbar');
    $('#stEntryPlayer').scrollIntoView({ block: 'center' }); await wait(600);
    const eb = $('#stEntryPlayer').getBoundingClientRect(), top = document.elementFromPoint(eb.x + eb.width / 2, eb.y + eb.height / 2);
    ok(eb.width > 0 && top && top.closest('#stEntryPlayer') != null, 'entry: the world-screen button is visible and not covered' + (top && !top.closest('#stEntryPlayer') ? ` (covered by ${top.id || top.className || top.tagName})` : ''));
    $('#stEntryPlayer').click(); await until(() => !!$('[data-example]'));
    ok($('#stSM').parentElement.style.display === 'none', 'player: success selector is hidden for players');
    $('[data-example]').click();
    ok(await until(() => $$('.st-rec').length === 6), 'player: example seeds give 6 recommendation cards');
    ok($$('.st-rec.on').length === 1 && $$('#stWhy .st-dr').length >= 2, 'player: the first pick is explained right away, one row per switched-on dimension');
    const why0 = $('#stWhy h3').textContent;
    $$('.st-rec [data-pick]')[1].click(); await wait(50);
    ok(/Why this game|为什么推荐/.test($('#stWhy').textContent) && $$('.st-rec.on').length === 1 && $('#stWhy h3').textContent !== why0, 'player: picking another card switches the comparison');
    $('[data-dim="tags"]').click(); await wait(50); $('[data-dim="rating"]').click(); await wait(50); $('[data-dim="price"]').click(); await wait(50);
    ok($$('#stWhy .st-dsvg').length === 1 && /cheaper|more than|[Ss]ame price|free|便宜|贵|同价|免费/.test($('#stWhy .st-drh').textContent), 'player: price only says how much cheaper or pricier, with one chart');
    $('[data-dim="price"]').click(); await wait(50); $('[data-dim="tags"]').click(); await wait(50); $('[data-dim="rating"]').click(); await wait(50);
    ok($$('#stWhy .st-tg').length > 0, 'player: gameplay row names the shared tags');
    $('[data-dim="gems"]').click(); await wait(50);
    ok($$('.st-rec').length > 0 && $('[data-dim="gems"]').classList.contains('on'), 'player: hidden gems toggle re-ranks');
    $('[data-dim="tags"]').click(); await wait(50); $('[data-dim="rating"]').click(); await wait(50);   // only hidden gems left on
    ok(!/Priced like|Plays like|Closest to/.test($('#stBody').textContent), 'player: reasons only cite dimensions that are switched on');
    $('[data-dim="tags"]').click(); await wait(50); $('[data-dim="rating"]').click(); await wait(50);
    const q0 = $('#stQ'); q0.value = 'zzqqxx'; q0.dispatchEvent(new Event('input')); await until(() => !!$('#stSugg .st-none'), 2000);
    ok(!!$('#stSugg .st-none'), 'player: a search with no match says so');
    $('[data-unseed]').click(); await wait(50);
    const q = $('#stQ'); q.value = 'Celeste'; q.dispatchEvent(new Event('input')); await until(() => $$('#stSugg [data-seed]').length > 0, 2000);
    ok($$('#stSugg [data-seed]').length > 0, 'player: search suggests games');
    q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await wait(50);
    ok(/Celeste/.test($('.st-seeds').innerText), 'player: Enter adds the top suggestion');
    ok(/#studio\/player\/\d/.test(location.hash), 'player: share link carries the seed games');
    $('#stMode [data-m="dev"]').click(); await wait(50); $('[data-v="lane"]').click(); await wait(50);
    const before = $$('.st-combo .st-chip').length; $('#stComp [data-add]').click(); await wait(50);
    ok($$('.st-combo .st-chip').length === before + 1, 'lane: + adds a tag to the combo');
    ok($$('#stTrend circle').length > 0 && $$('#stMap circle').length > 0, 'lane: both charts drawn');
    $('[data-go-plan]').click(); await wait(50);
    ok(!!$('#stOdds svg'), 'plan: odds chart renders');
    $('[data-lt="3"]').click(); await wait(50); $('[data-price="4"]').click(); await wait(50);
    ok(/\$20–30/.test($('#stOdds').textContent), 'plan: editing price updates the active plan');
    $('[data-plan="new"]').click(); await wait(50);
    ok($$('.st-tabs [data-plan]').filter(b => /^\d$/.test(b.dataset.plan)).length === 3 && $$('#stDiff div').length === 2, 'plan: + New adds Plan C and compares it with both others');
    $('#stSM [data-k="g"]').click(); await wait(50);
    ok(/depends on price|和价格有关/.test($('#stBody').innerText), 'plan: gross definition shows the price caveat');
    $('#stBack').click(); await wait(50);
    ok(!document.body.classList.contains('studio-open') && !location.hash.startsWith('#studio'), 'back: closes Studio and clears the link');
    // from the map: a locked tag offers both tasks; a selected game is placed within its tag
    lock('Card Game'); await wait(300);
    ok($('#toFind').offsetWidth > 0 && $('#toLane').offsetWidth > 0, 'map: a selected tag offers both find-a-game and analyse-the-market');
    $('#toFind').click(); ok(await until(() => $$('.st-rec').length === 6), 'map → player: games of the tag are listed');
    const fileImgs = $$('.st-rec img[src^="covers/"]'); await until(() => fileImgs.every(i => i.complete), 4000);
    const loaded = fileImgs.filter(i => i.isConnected && i.naturalWidth > 0).length;
    ok(fileImgs.length > 0 && loaded === fileImgs.length && $$('.st-rec .st-game').every(g => g.querySelector('img') || g.querySelector('.ph')), `player: covers without an embedded image load from covers/ (${loaded}/${fileImgs.length} loaded), names otherwise`);
    ok(/Card Game/.test(($('.st-only') || {}).textContent || ''), 'map → player: the tag filter is shown');
    $('#stBack').click(); await wait(100);
    const gm = $$('#panel tr.gm').filter(r => r.dataset.g !== '');
    ok(gm.length > 1, 'map: the panel lists selectable games');
    gm[0].click(); await wait(200);
    const nameA = $('#selName').textContent, rowsA = $$('#gpos .st-gprow').length;
    ok(/ · Card Game$/.test(nameA) && rowsA === 3 && $('#kpis').style.display === 'none', 'map: selecting a game shows "game · tag" and its place among the tag (' + nameA + ')');
    $$('#panel tr.gm').filter(r => r.dataset.g !== '')[1].click(); await wait(200);
    ok($('#selName').textContent !== nameA && $$('#gpos .st-gprow').length === 3, 'map: switching games updates the title and values');
    $('#toFind').click(); ok(await until(() => $$('.st-seed').length === 1 && $$('.st-rec').length === 6), 'map → player: a selected game becomes the seed');
    $('#stBack').click(); await wait(100);
    $('#crumbs [data-x="game"]').click(); await wait(200);
    ok($('#selName').textContent === 'Card Game' && $('#gpos').style.display === 'none' && $('#kpis').style.display !== 'none', 'map: clearing the game returns to the tag overview');
    // batch A (issues 016–020, 027)
    Studio.open({ view: 'lane', combo: ['Card', 'Game', 'Roguelike'] });
    ok(await until(() => $('.st-notice') && $$('.st-combo .st-chip').length === 1), 'lane: a link with split or unknown tags is repaired and says so');
    ok(/Rogue-like/.test($('.st-notice').textContent), 'lane: an unknown tag suggests close names');
    ok($$('.st-reads li').length === 2, 'lane: the crowding card states competition and performance in words');
    $('[data-preset="Puzzle"]').click(); await wait(300);
    ok(!$('.st-notice'), 'lane: the repair notice goes away once the combo changes');
    Studio.open({ view: 'plan', combo: ['Deckbuilding', 'Rogue-lite'], plans: 'A52-B10-C33', active: '2' });
    ok(await until(() => $('.st-planhd h2') && /Deckbuilding/.test($('.st-planhd h2').textContent)), 'plan: the heading names the lane being compared');
    ok($$('.st-tabs [data-plan]').filter(b => /^\d$/.test(b.dataset.plan)).length === 3 && $('.st-tabs [data-plan].on').dataset.plan === '2', 'plan: plans and the active plan come from the link');
    ok(/\/A52-B10-C33\/2$/.test(location.hash), 'plan: the share link carries the plans (' + location.hash + ')');
    $('[data-price="1"]').click(); await wait(300);
    ok(/\/A52-B10-C13\/2$/.test(location.hash), 'plan: editing a plan updates the share link (' + location.hash + ')');
    $('.st-planhd [data-preset="Card Game"]').click(); await wait(300);
    ok(/Card Game/.test($('.st-planhd h2').textContent) && $$('.st-tabs [data-plan]').filter(b => /^\d$/.test(b.dataset.plan)).length === 3, 'plan: switching lanes keeps the plans');
    $('#stBack').click(); await wait(100);
    // batch C (issues 015, 025): role entries on the first screen, skip lands on them.
    // Headless virtual time renders no frames, so scroll events are dispatched by hand after each programmatic scroll.
    const scrolled = () => dispatchEvent(new Event('scroll'));
    scrollTo(0, 0); scrolled(); await wait(300);
    const inView = el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && !$('#stFirst').classList.contains('gone'); };   // the class, not computed visibility: transitions do not advance without frames
    await wait(300); scrollTo(0, 0); scrolled();   // closing earlier Studio checks may restore focus and scroll after the first scrollTo
    ok(inView($('#stFirstDev')) && inView($('#stFirstPlayer')), 'first screen: both role entries are visible without scrolling (y=' + scrollY + ' top=' + Math.round($('#stFirstDev').getBoundingClientRect().top) + ' ' + $('#stFirst').className + ' ' + document.body.className + ')');
    $('#stFirstPlayer').click(); ok(await until(() => document.body.classList.contains('studio-open') && Studio.state.mode === 'player'), 'first screen: "find my next game" opens the player');
    $('#stBack').click(); await wait(100); scrollTo(0, 0); scrolled(); await wait(200);
    $('#stFirstDev').click(); ok(await until(() => Studio.state.mode === 'dev' && Studio.state.view === 'lane'), 'first screen: "plan my game" opens the lane step');
    $('#stBack').click(); await wait(100); scrollTo(0, 0); scrolled(); await wait(200);
    $('#skip').click(); scrolled();
    const cardsOk = () => { const rs = $('#stEntryDev').getBoundingClientRect(), rp = $('#stEntryPlayer').getBoundingClientRect();
      return rs.top >= 0 && rs.bottom <= innerHeight && Math.abs(rs.height - rp.height) < 1 && Math.abs(rs.width - rp.width) < 1; };
    ok(await until(cardsOk, 3000), 'skip lands on the role cards, which share one size');
    ok($('#stFirst').classList.contains('gone'), 'the first-screen box fades once the page has scrolled (y=' + scrollY + ' ' + $('#stFirst').className + ')');
    // batch B (issue 021): the lane map names the companions people look for
    Studio.open({ view: 'lane', combo: ['Card Game'] });
    ok(await until(() => $$('#stMap text').some(t => t.textContent === '+ Deckbuilding')), 'lane map: Deckbuilding is labelled on the Card Game map');
    $('#stBack').click(); await wait(100);
    // issue 023: one ocean rule everywhere, recomputed per success definition
    { const oc = oceans(), red = FINDINGS.red[0], blue = FINDINGS.blue[0];
      ok(red && blue && oc[red].cls === 'red' && oc[blue].cls === 'blue', 'oceans: the summary lists come from the shared rule');
      const st = tourStops(); ok(st.some(x => x.tag === red && oc[x.tag].cls === 'red') && st.some(x => oc[x.tag] && oc[x.tag].cls === 'blue'), 'oceans: the tour picks its red and blue stops by the shared rule');
      lock(red); await wait(300);
      ok([...$$('#achv .ach')].some(e => e.textContent.trim() === OCEAN.red[1]()) || $$('#achv .more').length > 0, 'oceans: the map badge shows the shared class');
      ok(!/★/.test($('#boss').textContent), 'Boss card: no star rating or tier name, only the review split (issue 011)');
      Studio.open({ view: 'lane', combo: [red] });
      ok(await until(() => $$('.st-verdict').some(e => e.textContent.trim() === OCEAN.red[1]())), 'oceans: a single-tag lane in Studio shows the same class');
      ok($$('.st-verdict').some(e => e.classList.contains('red') && e.textContent.includes('·')), 'oceans: Studio rates a red-ocean tag as crowded for its kind, not uncrowded');
      Studio.open({ view: 'lane', combo: [blue] }); await wait(300);
      ok(!$$('.st-verdict').some(e => e.classList.contains('red') && e.textContent.includes('·')), 'oceans: Studio never calls a blue-ocean candidate crowded');
      const pz = Object.keys(oc).find(t => oc[t].cls !== oceans('hit_o')[t].cls);
      ok(!!pz, 'oceans: switching the success definition recomputes the classes (e.g. ' + pz + ')');
      Studio.open({ view: 'lane', combo: ['Roguelike Deckbuilder'], sm: 'r' }); await wait(300);
      const cls0 = $$('.st-verdict').map(e => e.textContent.trim()).pop();
      $('#stSM [data-k="o"]').click(); await wait(400);
      const why = $('.st-ocwhy').textContent, cls1 = $$('.st-verdict').map(e => e.textContent.trim()).pop();
      ok(cls0 === OCEAN[oceans('hit')['Roguelike Deckbuilder'].cls][1]() && cls1 === OCEAN[oceans('hit_o')['Roguelike Deckbuilder'].cls][1]() && cls0 !== cls1 && why.includes(cls0), 'oceans: clicking the owners definition reclassifies the lane and names the map\'s class (' + cls0 + ' → ' + cls1 + ')');
      $('#stSM [data-k="r"]').click(); await wait(200);
      $('#stBack').click(); await wait(100); }
    // issue 022: a selected tag opens on supply and per-100 success, with their basis.
    // Tags are selected on the map, and the panel slides in, so every check polls rather than waiting a fixed time.
    toBottom(false); dispatchEvent(new Event('scroll')); await wait(300);
    lock('Card Game');
    ok(await until(() => $('#tagFirst') && $('#tagFirst').style.display !== 'none' && $$('#tagFirst .tf-ln').length === 2 && $$('#tagFirst .tf-mk').length === 1), 'panel: a selected tag shows the share and per-100 charts with a market line');
    ok($$('#tagFirst .tf-n').length === 7 && /\d/.test(($('#tagFirst .tf-obs') || {}).textContent || ''), 'panel: the observation states numbers and each year shows its n');
    // the page may still be easing back from the intro; keep it on the map until the panel settles
    ok(await until(() => { const o = $('#tagFirst .tf-obs'), b = o && o.getBoundingClientRect().bottom;
      if (!o || b >= innerHeight) { toBottom(false); dispatchEvent(new Event('scroll')); $('.layout .right').scrollTop = 0; }
      return !!o && b > 0 && b < innerHeight; }), 'panel: the observation is on the first screen (bottom ' + Math.round((($('#tagFirst .tf-obs') || document.body).getBoundingClientRect()).bottom) + ' of ' + innerHeight + ')');
    ok(!!($('#panel').compareDocumentPosition($('#boss')) & Node.DOCUMENT_POSITION_FOLLOWING), 'panel: concentration (Boss) sits below the data tabs');
    const gm2 = $$('#panel tr.gm').filter(r => r.dataset.g !== '')[0];
    if (gm2) gm2.click();
    ok(!gm2 || await until(() => $('#tagFirst').style.display === 'none'), 'panel: selecting a game swaps the tag charts for the game position');
    if ($('#crumbs [data-x="game"]')) $('#crumbs [data-x="game"]').click(); await wait(200);
    // issue 024: watch tags and games on the map; Studio starts from them, explicit choices and edits win
    try { localStorage.removeItem('stm-watch'); } catch (e) {}
    Studio.watch.get().tags.slice().forEach(t => Studio.watch.toggle('tags', t)); Studio.watch.get().games.slice().forEach(a => Studio.watch.toggle('games', a));
    if (Studio.state.open) { Studio.close(); await wait(200); }
    toBottom(false); dispatchEvent(new Event('scroll')); await wait(300);
    const WB = () => $('#watchBtn');
    // every step waits for the state it needs; the map ignores selection while it is still settling
    const watchTag = async t => { await until(() => { if (state.locked !== t) lock(t); return state.locked === t && WB() && WB().style.display !== 'none'; });
      WB().click(); await until(() => WB().getAttribute('aria-pressed') === 'true'); };
    await until(() => { if (state.locked !== 'Card Game') lock('Card Game'); return state.locked === 'Card Game' && WB() && WB().style.display !== 'none'; });
    ok(WB().getAttribute('aria-pressed') === 'false', 'watch: viewing a tag does not add it to the list');
    await watchTag('Card Game'); await watchTag('Roguelike Deckbuilder');
    ok(Studio.watch.get().tags.join('|') === 'Roguelike Deckbuilder|Card Game', 'watch: two tags watched, most recent first');
    // select two of the tag's covered games through the same function a row click calls, so this does not wait on the panel tabs
    const gids = Array.from(Studio.db().withTags(['Roguelike Deckbuilder'])).map(r => Studio.db().col.cover[r]).filter(c => c >= 0).slice(0, 2);
    for (const g of gids) { selectGame('Roguelike Deckbuilder', g);
      await until(() => WB().getAttribute('aria-pressed') === 'false' && /game|游戏/i.test(WB().textContent)); WB().click(); await until(() => WB().getAttribute('aria-pressed') === 'true');
      clearGame(); await until(() => !/game|游戏/i.test(WB().textContent)); }
    ok(Studio.watch.get().games.length === 2, 'watch: two games watched by AppID (' + Studio.watch.get().games.join(',') + ')');
    Studio.open({ view: 'lane' }); await until(() => $$('.st-watch .st-wchip').length === 2);
    ok(Studio.state.combo.join('+') === 'Roguelike Deckbuilder', 'watch: developer starts from the most recent watched tag, not their intersection');
    $('.st-watch [data-add="Card Game"]').click(); await wait(200);
    ok(Studio.state.combo.join('+') === 'Roguelike Deckbuilder+Card Game', 'watch: a watched tag can be added to the combo in one click');
    Studio.close(); await wait(200); Studio.open({ view: 'lane' }); await wait(300);
    ok(Studio.state.combo.join('+') === 'Roguelike Deckbuilder+Card Game', 'watch: reopening keeps the edited combo');
    Studio.close(); await wait(200); Studio.state.seeds = []; Studio.state.ptag = null;   // a fresh player, as on a first visit (edited seeds would win)
    Studio.open({ view: 'player' }); await until(() => $$('[data-wseed]').length === 2);
    ok(Studio.state.seeds.length === 2 && $$('[data-wtag]').length === 2, 'watch: player starts from the watched games, watched tags offered as filters');
    $('[data-wseed]').click(); await wait(200);
    ok(Studio.state.seeds.length === 1 && $$('[data-wseed].on').length === 1, 'watch: a watched game can be removed from the seeds and added back');
    Studio.close(); await wait(200);
    Studio.open({ view: 'lane', combo: ['Puzzle'] }); await wait(300);
    ok(Studio.state.combo.join('+') === 'Puzzle', 'watch: an explicit "analyse this tag" wins over the watchlist');
    Studio.close(); await wait(200);
    await until(() => { if (state.locked !== 'Card Game') lock('Card Game'); return state.locked === 'Card Game' && WB().getAttribute('aria-pressed') === 'true'; });
    WB().click(); await until(() => WB().getAttribute('aria-pressed') === 'false');
    Studio.open({ view: 'lane' }); await wait(300);
    ok($$('.st-watch .st-wchip').length === 1, 'watch: unwatching on the map updates the quick picks');
    Studio.close(); await wait(200);
    // Codex review of 024: benchmarks, role switch, untouched-only defaults, empty shared combo
    Studio.open({ view: 'lane' }); await until(() => $$('[data-bench]').length === 2);
    $('[data-bench]').click(); await until(() => $('.st-bench'));
    ok(!!$('.st-bench') && /\d/.test($('.st-bench').textContent), 'watch: a watched game opens as a benchmark against the lane');
    Studio.close(); await wait(200); Studio.state.seeds = []; Studio.state.ptag = null;
    Studio.open({ view: 'lane' }); await wait(200); $('#stMode [data-m="player"]').click(); await wait(300);
    ok(Studio.state.seeds.length === 2, 'watch: switching role inside Studio also starts from the watched games');
    const ws = Studio.watch.get(); ws.games.forEach(a => Studio.watch.toggle('games', a)); ws.tags.forEach(t => Studio.watch.toggle('tags', t));
    Studio.close(); await wait(200); Studio.open({ view: 'player' }); await wait(300);
    ok(Studio.state.seeds.length === 0 && Studio.state.ptag == null && !!$('#stQ'), 'watch: an emptied watchlist clears the seeds it filled in');
    Studio.close(); await wait(200);
    // issue 026: the first screen shows real covers and the tags they actually share, clear of the headline
    if (Studio.state.open) { Studio.close(); await wait(200); }
    scrollTo(0, 0); dispatchEvent(new Event('scroll')); dispatchEvent(new Event('resize'));
    ok(await until(() => $('#stCovers') && !$('#stCovers').hidden && $$('#stCovers .st-cov img').length >= 4), 'intro: real covers on the first screen');
    { const D = Studio.db(), covs = $$('#stCovers .st-cov'), games = covs.map(b => D.game(Array.from(D.withTags([])).find(r => D.col.cover[r] === +b.dataset.cov)));
      const tags = $$('#stCovers .st-ctag').map(x => x.textContent), lines = $$('#stCovers line').length, real = games.reduce((n, g) => n + tags.filter(t => g.tags.includes(t)).length, 0);
      // the exact set of (game, tag) pairs that should be joined, against the set actually drawn, endpoints at rendered centres
      const box = $('#stCovers').getBoundingClientRect(), W = box.width, chips = $$('#stCovers .st-ctag');
      const want = new Set(); covs.forEach((b, i) => tags.forEach(t => { if (games[i].tags.includes(t)) want.add(b.dataset.cov + '|' + t); }));
      const drawn = $$('#stCovers line').map(l => l.dataset.g + '|' + l.dataset.t), same = drawn.length === want.size && new Set(drawn).size === drawn.length && drawn.every(k => want.has(k));
      const cen = el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 - box.left; };
      const ends = $$('#stCovers line').every(l => { const x1 = +l.getAttribute('x1'), x2 = +l.getAttribute('x2');
        const c = covs.find(b => b.dataset.cov === l.dataset.g), ch = chips.find(x => x.textContent === l.dataset.t);
        return c && ch && Math.abs(x1 - cen(c)) < 1.5 && Math.abs(x2 - cen(ch)) < 1.5 && x1 >= 0 && x1 <= W && x2 >= 0 && x2 <= W; });
      ok(lines > 0 && same && ends, 'intro: the lines are exactly the real game-tag pairs, ending at the covers and chips (' + lines + ' lines)');
      ok(games.some(g => g.rv >= 100000) && games.some(g => g.rv < 10000), 'intro: big hits and a small game side by side');
      const hb = $('#story .beat p').getBoundingClientRect().top, cb = Math.max(...$$('#stCovers .st-ctag, #stCovers .st-ccap').map(x => x.getBoundingClientRect().bottom));
      ok(cb < hb, 'intro: covers and tags end above the headline (' + Math.round(cb) + ' < ' + Math.round(hb) + ')'); }
    const firstCov = +$('#stCovers .st-cov').dataset.cov; $('#stCovers .st-cov').click();
    ok(await until(() => Studio.state.open && Studio.state.mode === 'player' && Studio.state.seeds.length === 1 && Studio.db().col.cover[Studio.state.seeds[0]] === firstCov), 'intro: clicking a cover finds games like that one');
    Studio.close(); await wait(200);
    // issue 007: review-count spread and store-page practice in the lane
    Studio.open({ view: 'lane', combo: ['Card Game'] });
    ok(await until(() => $$('#stStore .r').length === 8), 'lane: store-page card shows 7 groups and the whole lane');
    { const D = Studio.db(), rows = Array.from(D.withTags(['Card Game'])).filter(r => D.col.year[r] >= 2018 && D.col.year[r] <= 2024);
      const n = sel => +($$('#stStore .r').find(r => r.firstElementChild.textContent === sel) || { children: [0, { textContent: 'NaN' }] }).children[1].textContent.replace(/,/g, '');
      const self = rows.filter(r => D.pubType(r) === 1).length, ext = rows.filter(r => D.pubType(r) === 2).length, ea = rows.filter(r => D.earlyAccess(r)).length;
      const L = document.documentElement.lang === 'zh' || /[一-鿿]/.test($('#stStore').textContent);
      ok(n(L ? '自己发行' : 'Self-published') === self && n(L ? '有外部发行商' : 'Outside publisher') === ext && n(L ? '仍在 Early Access' : 'Still in Early Access') === ea,
        'lane: group sizes match the per-game table (' + self + ' / ' + ext + ' / ' + ea + ')');
      const q = GameDB.quantile(rows.map(r => D.col.reviews[r]), .9);
      ok($('#stStore .st-spread').textContent.includes(fmt(Math.round(q))), 'lane: the review spread states the 90th percentile (' + Math.round(q) + ')'); }
    Studio.close(); await wait(200);
    // issue 008: hidden gems in the tag panel, by a stated rule
    toBottom(false); dispatchEvent(new Event('scroll'));
    await until(() => { if (state.locked !== 'Card Game') lock('Card Game'); return state.locked === 'Card Game' && $$('#cpGem tbody tr').length > 0; });
    { const D = GDB(), gs = D.gems('Card Game'), rows = $$('#cpGem tbody tr');
      ok(rows.length === gs.length && gs.length > 0 && gs.every(x => { const g = D.game(x.r); return x.n >= 50 && x.n <= 500 && g.y >= 2018 && g.y <= 2024; }),
        'panel: hidden gems all have 50–500 reviews and were released 2018–24 (' + gs.length + ')');
      ok(gs.every((x, i) => !i || gs[i - 1].lb >= x.lb) && gs.every(x => x.lb <= x.p), 'panel: gems are ordered by the Wilson lower bound, which sits below the raw share');
      ok(/50/.test($('#cpGem').closest('.card').textContent) && /500/.test($('#cpGem').closest('.card').textContent), 'panel: the gem card states its rule');
      const withCover = rows.find(r => r.dataset.g !== '');
      // prefer a gem that is not in the tag's own cover lists: that is the case the panel has to look up in the per-game table
      const own = new Set([...T['Card Game'].games, ...T['Card Game'].covers].map(x => x.i)), pickRow = rows.find(r => r.dataset.g !== '' && !own.has(+r.dataset.g)) || withCover;
      if (pickRow) { const name = D.game(gs[rows.indexOf(pickRow)].r).n; pickRow.click();
        ok(await until(() => state.game && state.game.i === +pickRow.dataset.g && $('#heroGame b') && $('#heroGame b').textContent === name), 'panel: a gem with a cover pins on the map and fills the banner (' + name + ')');
        ok($('#crumbs').textContent.includes(name), 'panel: the breadcrumb names the pinned gem');
        clearGame(); await wait(100); } }
  } catch (e) { out.push('FAIL crashed: ' + e.message); }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  const pre = document.createElement('pre'); pre.id = 'e2e'; pre.textContent = out.join('\n'); document.body.appendChild(pre);
})();
