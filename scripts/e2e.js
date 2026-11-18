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
  } catch (e) { out.push('FAIL crashed: ' + e.message); }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  const pre = document.createElement('pre'); pre.id = 'e2e'; pre.textContent = out.join('\n'); document.body.appendChild(pre);
})();
