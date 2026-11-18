/* Parity test: the in-browser engine must reproduce the Python per-tag aggregates.
   Usage: node scripts/test_db.js data/games.json data/dash_offline.json */
const fs = require('fs');
const GameDB = require('./db.js');
// the page scripts must at least parse (they need a browser to run)
for (const f of ['db.js', 'studio.js']) new Function(fs.readFileSync(require('path').join(__dirname, f), 'utf8'));
const [gamesPath = 'data/games.json', dashPath = 'data/dash_offline.json'] = process.argv.slice(2);

let t0 = Date.now();
const raw = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
const dash = JSON.parse(fs.readFileSync(dashPath, 'utf8'));
const db = GameDB.open(raw);
console.log(`opened ${db.n} games, ${db.tags.length} tags in ${Date.now() - t0} ms`);

// exported values are rounded to 4 decimals (prices to 2), so allow half a unit in the last place plus float noise
const TOL = 5.1e-5, PTOL = 5.1e-3;
const fails = [];
const near = (a, b, tol) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= tol);
function cmp(where, path, js, py, tol = TOL) {
  if (Array.isArray(py)) { if (!Array.isArray(js) || js.length !== py.length) return fails.push(`${where} ${path}: length ${js && js.length} vs ${py.length}`); return py.forEach((v, i) => cmp(where, `${path}[${i}]`, js[i], v, tol)); }
  if (py && typeof py === 'object') return Object.keys(py).forEach(k => cmp(where, `${path}.${k}`, js && js[k], py[k], tol));
  if (typeof py === 'string') { if (js !== py) fails.push(`${where} ${path}: ${js} vs ${py}`); return; }
  if (typeof py === 'number' && Number.isInteger(py) && Math.abs(py) >= 1 && tol === 0) { if (js !== py) fails.push(`${where} ${path}: ${js} vs ${py}`); return; }
  if (!near(js, py, tol)) fails.push(`${where} ${path}: ${js} vs ${py}`);
}
const FIELDS = { n: 0, hits: 0, hit: TOL, hit_o: TOL, hit_g: TOL, score: TOL, recent: TOL, price: PTOL, zh: TOL, own_med: 0, gross_med: 1, gross_p90: 1,
  price_b: TOL, lang_b: TOL, price_dist: TOL, play: TOL, feats: TOL };

const skipped = new Set();   // fields the Python export no longer writes (issue 005 pruned owner/gross rates from the map)
function check(where, js, py, fields) {
  for (const [f, tol] of Object.entries(fields)) { if (!(f in py)) { skipped.add(f); continue; } cmp(where, f, js[f], py[f], tol); }
}

t0 = Date.now();
const names = Object.keys(dash.tags);
for (const t of names) {
  const rows = db.withTags([t]), s = db.summarize(rows), py = dash.tags[t];
  check(t, s, py, { ...FIELDS, year: 0, gstat: 0 });
  cmp(t, 'yshare', db.yshare(rows), py.yshare);
}
console.log(`summarized ${names.length} tags in ${Date.now() - t0} ms`);
// the market baseline: export.py feeds untagged games into the yearly trend and gstat, so those two are skipped
check('(all)', db.summarize(db.all()), dash.base, FIELDS);

// spot checks against numbers already shown in the prototype notes (lofi-prototype/data.js)
const lane = db.where({ tags: ['Deckbuilding', 'Rogue-lite'], scope: true });
const perYear = [2018, 2019, 2020, 2021, 2022, 2023, 2024].map(y => db.where({ tags: ['Deckbuilding', 'Rogue-lite'], years: [y, y] }).length);
cmp('lane', 'n', lane.length, 526, 0);
cmp('lane', 'per year', perYear, [6, 17, 32, 49, 83, 130, 209], 0);
// filter edge cases
cmp('where', 'duplicate language', db.where({ langs: ['German', 'German'] }).length, db.where({ langs: ['German'] }).length, 0);
cmp('where', 'unknown feature', db.where({ feats: ['no such feature'] }).length, 0, 0);
cmp('where', 'unknown language', db.where({ langs: ['Klingon'] }).length, 0, 0);
// year-adjusted success: the whole market must come out at exactly 1, and a lane's yearly O sums to its total
cmp('oe', 'market ratio', db.oe(db.all()).ratio, 1, 1e-9);
const ly = db.laneYears(lane), lo = db.oe(lane);
cmp('oe', 'lane O by year', ly.reduce((s, y) => s + y.O, 0), lo.O, 0);
cmp('oe', 'lane CI brackets ratio', +(lo.lo < lo.ratio && lo.ratio < lo.hi), 1, 0);
const comp = db.companions(db.withTags(['Card Game']), ['Card Game']);
cmp('companions', 'no outcome tags', comp.filter(c => raw.outcome.includes(c.tag)).length, 0, 0);
cmp('companions', 'Card Game + Deckbuilding n', comp.find(c => c.tag === 'Deckbuilding').n, 742, 0);
// plan cohorts: no filter reproduces the lane's own rate; identical weights make A vs B comparable
const laneAll = db.withTags(['Deckbuilding', 'Rogue-lite']);
cmp('cohort', 'unfiltered = lane rate', db.cohort(laneAll, null).rate, db.rate(lane).rate, 1e-9);
const cheap = db.cohort(laneAll, r => db.price[r] <= 4.99), mid = db.cohort(laneAll, r => db.price[r] > 9.99 && db.price[r] <= 19.99);
console.log(`lane ${(db.rate(lane).rate * 100).toFixed(1)}% · <$5 ${(cheap.rate * 100).toFixed(1)}% (n ${cheap.n}) · $10–20 ${(mid.rate * 100).toFixed(1)}% (n ${mid.n}) · market same mix ${(db.marketFor(laneAll) * 100).toFixed(1)}%`);
cmp('cohort', 'range brackets rate', +(cheap.lo <= cheap.rate && cheap.rate <= cheap.hi), 1, 0);
const boot = db.cohortBoot(laneAll, [null, r => db.price[r] <= 4.99]), [blo, bhi] = db.interval(boot, x => x[0]);
cmp('boot', 'lane interval brackets lane rate', +(blo < db.rate(lane).rate && db.rate(lane).rate < bhi), 1, 0);
console.log(`bootstrap lane 95% ${(blo * 100).toFixed(1)}–${(bhi * 100).toFixed(1)}%, <$5 ${db.interval(boot, x => x[1]).map(v => (v * 100).toFixed(1)).join('–')}%`);
const sts = db.search('Slay the Spire', 1)[0];
cmp('search', 'Slay the Spire', db.name(sts), 'Slay the Spire', 0);
const sim = db.similar(sts, { k: 3 }).map(x => db.name(x.r));
console.log('similar to Slay the Spire:', sim.join(' · '));

// recommendations: seeds never come back, and the picks are named
t0 = Date.now();
const seeds = ['Slay the Spire', 'Hades', 'Stardew Valley'].map(q => db.search(q, 1)[0]);
const recs = db.recommend(seeds, { tags: true, price: false, rating: true, gems: false });
console.log(`recommend in ${Date.now() - t0} ms:`, recs.map(x => `${db.name(x.r)} (via ${db.name(seeds[x.best])}; ${x.shared.slice(0, 3).join(', ')})`).join(' | '));
cmp('recommend', 'six picks', recs.length, 6, 0);
cmp('recommend', 'no seeds', recs.filter(x => seeds.includes(x.r)).length, 0, 0);
const gems = db.recommend(seeds, { tags: true, gems: true });
console.log('with gems:', gems.map(x => `${db.name(x.r)} ${db.col.reviews[x.r]}rv`).join(' | '));

if (fails.length) {
  console.log(`\nFAIL: ${fails.length} mismatches`); fails.slice(0, 40).forEach(f => console.log('  ' + f));
  process.exit(1);
}
if (skipped.size) console.log(`not in this export, not compared: ${[...skipped].join(", ")}`);
console.log(`\nOK: ${names.length} tags + market baseline + lane spot checks match`);
