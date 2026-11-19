// Backtest of the shared blue / red ocean rule (issue 023).
// usage: node scripts/backtest_oceans.js [data/games.json] [data/dash_offline.json] [tag_families.csv]
// Classes are set on games released 2018–20 and checked on games released 2021–23. Newer games have had less time to
// collect reviews, so absolute rates fall with release year; the check therefore compares each tag with its family in the
// same later window (above / below the family median), not with its own earlier rate. Also reports how many tags change
// class when the window moves one year or the quartile cut changes.
// Both windows read today's snapshot (review counts are cumulative to 2026), so this compares two release cohorts. It does
// not show that the classes could have been picked at the end of 2020; that needs review counts as of each year's end.
const fs = require('fs'), path = require('path'), GameDB = require('./db.js');
const root = path.join(__dirname, '..');
const [gamesPath, dashPath, famPath] = [2, 3, 4].map((i, j) => process.argv[i] || path.join(root, ['data/games.json', 'data/dash_offline.json', 'tag_families.csv'][j]));
const db = GameDB.open(JSON.parse(fs.readFileSync(gamesPath, 'utf8')));
const dash = JSON.parse(fs.readFileSync(dashPath, 'utf8'));
const famMap = {};
fs.readFileSync(famPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).forEach(l => { const [t, f] = l.split(','); if (t) famMap[t] = f; });
const fam = t => dash.tags[t] && !dash.tags[t].outcome && famMap[t] && famMap[t] !== 'other' ? famMap[t] : null;
const names = db.tags.filter(fam);
const classify = (years, q = .25, def = 'hit') => GameDB.classifyOceans(db.tagStats(def, years, names), fam, { q });
const CLS = ['blue', 'busy', 'mixed', 'quiet', 'red', 'thin'];
const pc = v => (v * 100).toFixed(1) + '%';

const lines = [];
for (const def of ['hit', 'hit_o', 'hit_g']) {
  const early = classify([2018, 2020], .25, def), late = classify([2021, 2023], .25, def);
  lines.push(`\n### Success = ${def}: classes set on 2018–20, checked on 2021–23\n`);
  lines.push('| class (2018–20) | tags | distinct games 2021–23 | hits | rate | above family median in 2021–23 | same class in 2021–23 |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const c of CLS) {
    const ts = Object.keys(early).filter(t => early[t].cls === c && late[t]);
    if (!ts.length) { lines.push(`| ${c} | 0 | | | | | |`); continue; }
    // a game with several tags of the same class is counted once
    const rows = new Set(); for (const t of ts) for (const r of db.withTags([t])) { const y = db.col.year[r]; if (y >= 2021 && y <= 2023) rows.add(r); }
    const n = rows.size; let h = 0; for (const r of rows) h += db.hit(r, def);
    const above = ts.filter(t => late[t].ref && late[t].rate > late[t].ref.rateMed).length, same = ts.filter(t => late[t].cls === c).length;
    lines.push(`| ${c} | ${ts.length} | ${n} | ${h} | ${pc(h / n)} | ${above} / ${ts.length} | ${same} / ${ts.length} |`);
  }
  if (def === 'hit') {
    const blues = Object.keys(early).filter(t => early[t].cls === 'blue'), reds = Object.keys(early).filter(t => early[t].cls === 'red');
    lines.push(`\nBlue in 2018–20: ${blues.map(t => `${t} (${late[t] ? late[t].cls + ', ' + pc(late[t].rate) + ' vs median ' + pc(late[t].ref ? late[t].ref.rateMed : NaN) : 'n/a'})`).join('; ') || 'none'}`);
    lines.push(`\nRed in 2018–20: ${reds.map(t => `${t} (${late[t] ? late[t].cls : 'n/a'})`).join(', ') || 'none'}`);
  }
}
// stability
const base = classify([2018, 2024]), flips = (a, b) => Object.keys(a).filter(t => b[t] && a[t].cls !== b[t].cls);
const count = o => CLS.map(c => `${c} ${Object.values(o).filter(x => x.cls === c).length}`).join(', ');
lines.push('\n### Stability (success = 500+ reviews)\n');
lines.push(`- Live rule (2018–2024, q = 0.25): ${count(base)}.`);
for (const [lab, o] of [['q = 0.20', classify([2018, 2024], .2)], ['q = 0.30', classify([2018, 2024], .3)]]) {
  const f = flips(base, o);
  lines.push(`- ${lab}: ${count(o)}; ${f.length} tags change class${f.length ? ' (' + f.slice(0, 12).map(t => `${t} ${base[t].cls}→${o[t].cls}`).join(', ') + (f.length > 12 ? ', …' : '') + ')' : ''}.`);
}
const a = classify([2018, 2020]), b = classify([2019, 2021]), f = flips(a, b);
const bc = t => ['blue', 'red'].includes(a[t].cls) || ['blue', 'red'].includes(b[t].cls);
lines.push(`- Window 2018–20 → 2019–21: ${f.length} tags change class, ${f.filter(bc).length} of them into or out of blue / red (${f.filter(bc).map(t => `${t} ${a[t].cls}→${b[t].cls}`).join(', ') || 'none'}).`);
console.log(lines.join('\n'));
