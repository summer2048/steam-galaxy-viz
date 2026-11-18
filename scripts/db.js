/* Per-game query engine over data/games.json (built by scripts/export_games.py).
   Used by the page (inlined at build time) and by scripts/test_db.js under node.
   Rows are Uint32Array lists of row ids, sorted ascending. Bucket edges and rules mirror scripts/export.py. */
const GameDB = (() => {
  const TYPES = { u8: Uint8Array, u16: Uint16Array, u32: Uint32Array, i16: Int16Array };
  const NA = 0xFFFFFFFF;
  const SCOPE = [2018, 2024], YEARS = [], SHARE_YEARS = [];
  for (let y = 2010; y <= 2025; y++) YEARS.push(y);
  for (let y = 2018; y <= 2025; y++) SHARE_YEARS.push(y);
  // pd.cut style: right-inclusive (lo, hi]; same edges and order as export.py, labels live in DATA.labels
  const EDGES = {
    price: [-0.01, 0, 4.99, 9.99, 19.99, 29.99, 1e5],
    lang: [-1, 1, 4, 9, 1000],
  };
  const DEFS = { hit: 0, hit_o: 1, hit_g: 2 };   // success definition -> bit in flags
  const SAFE = 3;

  function bytes(s) {
    if (typeof atob !== 'function') { const b = Buffer.from(s, 'base64'), u = new Uint8Array(b.length); u.set(b); return u; }
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  const decode = (type, s) => { const u = bytes(s), C = TYPES[type]; return new C(u.buffer, 0, u.length / C.BYTES_PER_ELEMENT); };

  function median(a) {
    const n = a.length; if (!n) return null;
    const s = Float64Array.from(a).sort(), m = n >> 1;
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function quantile(a, q) {   // linear interpolation, as pandas
    const n = a.length; if (!n) return null;
    const s = Float64Array.from(a).sort(), p = (n - 1) * q, i = Math.floor(p);
    return i + 1 < n ? s[i] + (s[i + 1] - s[i]) * (p - i) : s[i];
  }
  const bucketOf = (edges, v) => { if (v == null || Number.isNaN(v)) return -1; for (let j = 1; j < edges.length; j++) if (v > edges[j - 1] && v <= edges[j]) return j - 1; return -1; };

  function open(raw) {
    const n = raw.n, n_ = n, C = {};
    for (const [k, [t, s]] of Object.entries(raw.cols)) C[k] = decode(t, s);
    const tagOff = decode('u32', raw.tag_off), tagIds = decode('u16', raw.tag_ids);
    const tagNames = raw.tags, tagId = new Map(tagNames.map((t, i) => [t, i]));
    const outcome = new Set(raw.outcome.map(t => tagId.get(t)).filter(i => i != null));
    const langBit = new Map(raw.langs.map((l, i) => [l, 2 ** i]));
    const featBit = new Map(raw.feats.map((f, i) => [f, 1 << i]));

    // derived columns
    const price = new Float64Array(n);
    for (let r = 0; r < n; r++) { const p = C.cents[r] / 100, d = C.disc[r]; price[r] = d >= 1 && d <= 99 ? p / (1 - d / 100) : p; }

    // inverted index: rows are visited in order, so every posting list comes out sorted
    const cnt = new Uint32Array(tagNames.length + 1);
    for (let i = 0; i < tagIds.length; i++) cnt[tagIds[i] + 1]++;
    for (let t = 1; t <= tagNames.length; t++) cnt[t] += cnt[t - 1];
    const postOff = cnt.slice(), post = new Uint32Array(tagIds.length), fill = cnt.slice(0, -1);
    for (let r = 0; r < n; r++) for (let i = tagOff[r]; i < tagOff[r + 1]; i++) post[fill[tagIds[i]]++] = r;
    const posting = t => post.subarray(postOff[t], postOff[t + 1]);

    // per-year totals of all tagged games, the denominators for share-of-year
    const yTot = new Map(SHARE_YEARS.map(y => [y, [0, 0]]));
    for (let r = 0; r < n; r++) { const e = yTot.get(C.year[r]); if (e) { e[0]++; e[1] += C.flags[r] & 1; } }

    let names = null;
    const name = r => (names || (names = raw.names.split('\n')))[r];
    const tagsOf = r => Array.from(tagIds.subarray(tagOff[r], tagOff[r + 1]), i => tagNames[i]);
    const hit = (r, def = 'hit') => (C.flags[r] >> DEFS[def]) & 1;
    const ratio = r => C.reviews[r] ? C.pos[r] / C.reviews[r] : null;
    const playH = r => C.play[r] ? C.play[r] / 60 : null;
    const owners = r => C.own[r] === NA ? null : C.own[r];
    const inScope = r => C.year[r] >= SCOPE[0] && C.year[r] <= SCOPE[1];

    function all() { const a = new Uint32Array(n); for (let r = 0; r < n; r++) a[r] = r; return a; }
    function filter(rows, pred) {
      const o = new Uint32Array(rows.length); let k = 0;
      for (let i = 0; i < rows.length; i++) if (pred(rows[i])) o[k++] = rows[i];
      return o.slice(0, k);
    }
    function has(list, v) { let lo = 0, hi = list.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m] === v) return true; if (list[m] < v) lo = m + 1; else hi = m - 1; } return false; }
    /** Games carrying every one of the tags. An unknown tag gives no games. */
    function withTags(tags) {
      if (!tags.length) return all();
      const lists = [];
      for (const t of tags) { const i = tagId.get(t); if (i == null) return new Uint32Array(0); lists.push(posting(i)); }
      lists.sort((a, b) => a.length - b.length);
      const [first, ...rest] = lists;
      return rest.length ? filter(first, r => rest.every(l => has(l, r))) : first.slice();
    }
    /** Query: {tags, years:[a,b], scope, price:[lo,hi], nlang:[lo,hi], langs:[name], feats:[label], minReviews, safe}.
        Ranges are inclusive; a null end is open. */
    function where(q = {}) {
      let rows = withTags(q.tags || []);
      const inR = (v, rg) => !rg || ((rg[0] == null || v >= rg[0]) && (rg[1] == null || v <= rg[1]));
      const langs = [...new Set(q.langs || [])], feats = [...new Set(q.feats || [])];
      // an unknown language or feature can match nothing; it must not be ignored
      if (langs.some(l => !langBit.has(l)) || feats.some(f => !featBit.has(f))) return new Uint32Array(0);
      const lm = langs.reduce((m, l) => m + langBit.get(l), 0), fm = feats.reduce((m, f) => m | featBit.get(f), 0);
      const years = q.scope ? SCOPE : q.years;
      return filter(rows, r => inR(C.year[r], years) && inR(price[r], q.price) && inR(C.nlang[r], q.nlang)
        && (!lm || (C.lang[r] & lm) >>> 0 === lm) && (!fm || (C.feat[r] & fm) === fm)
        && (q.minReviews == null || C.reviews[r] >= q.minReviews) && (!q.safe || (C.flags[r] >> SAFE) & 1));
    }
    function rate(rows, def = 'hit') {
      let h = 0; for (let i = 0; i < rows.length; i++) h += hit(rows[i], def);
      return { n: rows.length, hits: h, rate: rows.length ? h / rows.length : null };
    }
    /** Success rate per bucket. value: row -> number; edges right-inclusive. Rates with fewer than minN games are null. */
    function buckets(rows, value, edges, def = 'hit', minN = 30) {
      const k = edges.length - 1, nn = new Array(k).fill(0), hh = new Array(k).fill(0);
      for (let i = 0; i < rows.length; i++) { const r = rows[i], b = bucketOf(edges, value(r)); if (b >= 0) { nn[b]++; hh[b] += hit(r, def); } }
      const tot = nn.reduce((a, b) => a + b, 0);
      return { rate: nn.map((c, j) => c < minN ? null : hh[j] / c), n: nn, share: nn.map(c => tot ? c / tot : 0) };
    }
    const mean = (rows, f) => { if (!rows.length) return null; let s = 0; for (let i = 0; i < rows.length; i++) s += f(rows[i]); return s / rows.length; };
    const vals = (rows, f) => { const o = []; for (let i = 0; i < rows.length; i++) { const v = f(rows[i]); if (v != null) o.push(v); } return o; };

    /** Same fields as export.py summary() for the parts that come from per-game columns.
        rows: the segment across all years; the 2018-2024 scope is taken inside, as export.py does. */
    function summarize(rows) {
      const u = filter(rows, inScope), uh = filter(u, r => hit(r));
      const yearly = { n: YEARS.map(() => 0), hits: YEARS.map(() => 0) };
      for (let i = 0; i < rows.length; i++) { const r = rows[i], j = C.year[r] - YEARS[0]; if (j >= 0 && j < YEARS.length) { yearly.n[j]++; yearly.hits[j] += hit(r); } }
      const own = vals(u, owners), gross = vals(u, r => owners(r) == null ? null : owners(r) * price[r]);
      const pm = median(vals(u, r => price[r]));
      const feats = {};
      raw.feats.forEach((f, i) => {
        const w = filter(u, r => (C.feat[r] >> i) & 1), wo = filter(u, r => !((C.feat[r] >> i) & 1));
        feats[f] = { share: u.length ? w.length / u.length : null, hit_with: w.length >= 30 ? rate(w).rate : null, hit_without: wo.length >= 30 ? rate(wo).rate : null };
      });
      const pb = buckets(u, r => price[r], EDGES.price), lb = buckets(u, r => C.nlang[r], EDGES.lang);
      return {
        n: u.length, hits: uh.length, hit: rate(u).rate, hit_o: rate(u, 'hit_o').rate, hit_g: rate(u, 'hit_g').rate,
        own_med: median(own), gross_med: median(gross), gross_p90: quantile(gross, .9),
        score: median(vals(filter(u, r => C.reviews[r] >= 20), ratio)),
        recent: mean(u, r => C.year[r] >= 2022 ? 1 : 0),
        price: pm == null ? null : +pm.toFixed(2),   // toFixed rounds the exact binary value, like Python round()
        zh: mean(u, r => (C.feat[r] >> 5) & 1),
        year: yearly,
        price_b: { rate: pb.rate, n: pb.n }, lang_b: { rate: lb.rate, n: lb.n }, price_dist: pb.share,
        play: { all: median(vals(u, playH)), hits: median(vals(uh, playH)), cov: mean(u, r => C.play[r] ? 1 : 0) },
        feats,
        gstat: { total: rows.length, reviews: rows.reduce((s, r) => s + C.reviews[r], 0) },
      };
    }
    /** Share of each year's new tagged games (rel) and of its hits, 2018-2025, as dash_offline yshare. */
    function yshare(rows) {
      const nn = new Map(SHARE_YEARS.map(y => [y, [0, 0]]));
      for (let i = 0; i < rows.length; i++) { const r = rows[i], e = nn.get(C.year[r]); if (e) { e[0]++; e[1] += hit(r); } }
      const div = (a, b) => b ? a / b : 0;
      return { rel: SHARE_YEARS.map(y => div(nn.get(y)[0], yTot.get(y)[0])), hits: SHARE_YEARS.map(y => div(nn.get(y)[1], yTot.get(y)[1])) };
    }
    /** Most similar games by Jaccard over non-outcome tags. seed: list of tag names, or a row id.
        opts: {pool: rows (default: games with >= 50 reviews), k: 10, exclude: row ids} */
    function similar(seed, opts = {}) {
      const ids = typeof seed === 'number' ? Array.from(tagIds.subarray(tagOff[seed], tagOff[seed + 1])) : seed.map(t => tagId.get(t)).filter(i => i != null);
      const S = new Set(ids.filter(i => !outcome.has(i)));
      if (!S.size) return [];
      const skip = new Set(typeof seed === 'number' ? [seed, ...(opts.exclude || [])] : (opts.exclude || []));
      const pool = opts.pool || filter(all(), r => C.reviews[r] >= 50), out = [];
      for (let i = 0; i < pool.length; i++) {
        const r = pool[i]; if (skip.has(r)) continue;
        let own = 0, shared = 0;
        for (let j = tagOff[r]; j < tagOff[r + 1]; j++) { const t = tagIds[j]; if (outcome.has(t)) continue; own++; if (S.has(t)) shared++; }
        if (shared) out.push({ r, sim: shared / (own + S.size - shared), shared });
      }
      out.sort((a, b) => b.sim - a.sim || C.reviews[b.r] - C.reviews[a.r]);
      return out.slice(0, opts.k || 10);
    }
    // ---- year-adjusted success. Newer games have had less time to collect reviews, so a lane full of recent games
    // looks worse than it is. Each game is compared with the market rate of its own release year:
    // ratio = observed hits / expected hits (indirect standardisation). 1 = same as the market.
    const mkCache = {};
    function market(def = 'hit') {
      if (mkCache[def]) return mkCache[def];
      const n = {}, h = {};
      for (let r = 0; r < n_; r++) { const y = C.year[r]; if (y < SCOPE[0] || y > SCOPE[1]) continue; n[y] = (n[y] || 0) + 1; h[y] = (h[y] || 0) + hit(r, def); }
      const m = { n, rate: {} };
      for (const y in n) m.rate[y] = h[y] / n[y];
      return (mkCache[def] = m);
    }
    // Byar's approximation to the Poisson interval of a standardised ratio
    function ratioCI(O, E, z = 1.96) {
      if (!E) return { ratio: null, lo: null, hi: null };
      const lo = O ? O * (1 - 1 / (9 * O) - z / (3 * Math.sqrt(O))) ** 3 / E : 0;
      const O1 = O + 1, hi = O1 * (1 - 1 / (9 * O1) + z / (3 * Math.sqrt(O1))) ** 3 / E;
      return { ratio: O / E, lo, hi };
    }
    /** Observed vs expected hits for rows released within years (default: the scope). */
    function oe(rows, def = 'hit', years = SCOPE) {
      const m = market(def).rate; let O = 0, E = 0, n = 0;
      for (let i = 0; i < rows.length; i++) { const r = rows[i], y = C.year[r]; if (y < years[0] || y > years[1]) continue; n++; O += hit(r, def); E += m[y]; }
      return { n, O, E, ...ratioCI(O, E) };
    }
    /** Per release year: games, share of that year's new games, and year-adjusted success with its own interval.
        Years with no games get null ratios (drawn as gaps, not as zeros). */
    function laneYears(rows, def = 'hit') {
      const m = market(def), out = [];
      for (let y = SCOPE[0]; y <= SCOPE[1]; y++) {
        const o = oe(rows, def, [y, y]), c = o.n ? ratioCI(o.O, o.E) : { ratio: null, lo: null, hi: null };
        out.push({ y, n: o.n, share: o.n / m.n[y], O: o.O, E: o.E, ...c });
      }
      return out;
    }
    /** Tags that co-occur with the lane, each with the year-adjusted success of lane + that tag.
        exclude: tag names already in the lane. Outcome tags are skipped (they follow success, not cause it). */
    function companions(rows, exclude = [], def = 'hit', minN = 30) {
      const ex = new Set(exclude.map(t => tagId.get(t))), byTag = new Map();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]; if (!inScope(r)) continue;
        for (let j = tagOff[r]; j < tagOff[r + 1]; j++) { const t = tagIds[j]; if (ex.has(t) || outcome.has(t)) continue; let a = byTag.get(t); if (!a) byTag.set(t, a = []); a.push(r); }
      }
      const lane = oe(rows, def), out = [];
      for (const [t, rs] of byTag) {
        if (rs.length < minN) continue;
        const o = oe(rs, def), last = rs.filter(r => C.year[r] === SCOPE[1]).length;
        out.push({ tag: tagNames[t], n: rs.length, of: rs.length / lane.n, last, lastShare: last / market(def).n[SCOPE[1]], ...o });
      }
      return out.sort((a, b) => b.lo - a.lo);
    }
    /** Historical success rate of a cohort inside a lane, comparable across cohorts.
        For each release year: the cohort's hits are shrunk toward that year's lane rate (prior worth k games), then the
        years are averaged with the lane's own year mix, so two plans in the same lane always use identical weights.
        pred: row -> bool picks the cohort (e.g. price tier and language tier). Returns rate, 95% range, n, hits. */
    function cohort(laneRows, pred, def = 'hit', k = 10) {
      const ys = [];
      for (let y = SCOPE[0]; y <= SCOPE[1]; y++) ys.push({ y, n: 0, h: 0, cn: 0, ch: 0 });
      let N = 0;
      for (let i = 0; i < laneRows.length; i++) {
        const r = laneRows[i], j = C.year[r] - SCOPE[0]; if (j < 0 || j >= ys.length) continue;
        const e = ys[j], hh = hit(r, def); e.n++; e.h += hh; N++;
        if (!pred || pred(r)) { e.cn++; e.ch += hh; }
      }
      let rate = 0, v = 0, n = 0, hits = 0;
      for (const e of ys) {
        if (!e.n) continue;
        const w = e.n / N, p = e.h / e.n, s = (e.ch + k * p) / (e.cn + k);
        rate += w * s; v += w * w * s * (1 - s) / (e.cn + k); n += e.cn; hits += e.ch;
      }
      const se = Math.sqrt(v);
      return N ? { rate, lo: Math.max(0, rate - 1.96 * se), hi: Math.min(1, rate + 1.96 * se), se, n, hits } : { rate: null, lo: null, hi: null, se: null, n: 0, hits: 0 };
    }
    /** Joint bootstrap of cohort() for several cohorts at once: games are resampled within release year, and every
        cohort (and every difference between them) is recomputed on the same resample, so shared lane-year priors are
        accounted for. preds: list of row -> bool (null = whole lane). Returns per-cohort samples, B x preds.length. */
    function cohortBoot(laneRows, preds, def = 'hit', k = 10, B = 400, seed = 7) {
      let st = seed >>> 0 || 1; const rnd = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296;
      const byY = [];
      for (let i = 0; i < laneRows.length; i++) {
        const r = laneRows[i], j = C.year[r] - SCOPE[0]; if (j < 0 || j > SCOPE[1] - SCOPE[0]) continue;
        let mask = 0; preds.forEach((p, q) => { if (!p || p(r)) mask |= 1 << q; });
        (byY[j] || (byY[j] = [])).push([hit(r, def), mask]);
      }
      const N = byY.reduce((s, a) => s + (a ? a.length : 0), 0), P = preds.length, out = [];
      if (!N) return out;
      const cn = new Float64Array(P), ch = new Float64Array(P);
      for (let b = 0; b < B; b++) {
        const rate = new Float64Array(P);
        for (const ys of byY) {
          if (!ys) continue;
          const n = ys.length; let h = 0; cn.fill(0); ch.fill(0);
          for (let i = 0; i < n; i++) { const [hh, mask] = ys[(rnd() * n) | 0]; h += hh; for (let q = 0; q < P; q++) if (mask >> q & 1) { cn[q]++; ch[q] += hh; } }
          const p = h / n, wgt = n / N;
          for (let q = 0; q < P; q++) rate[q] += wgt * (ch[q] + k * p) / (cn[q] + k);
        }
        out.push(rate);
      }
      return out;
    }
    /** Percentile interval of f(sample) over bootstrap samples. */
    function interval(samples, f, a = .025) {
      const v = samples.map(f).sort((x, y) => x - y), at = q => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
      return v.length ? [at(a), at(1 - a)] : [null, null];
    }
    /** The market's rate with the lane's year mix, so lane and plans are compared with the market on equal terms. */
    function marketFor(laneRows, def = 'hit') {
      const m = market(def).rate, cnt = {}; let N = 0;
      for (let i = 0; i < laneRows.length; i++) { const y = C.year[laneRows[i]]; if (y < SCOPE[0] || y > SCOPE[1]) continue; cnt[y] = (cnt[y] || 0) + 1; N++; }
      let s = 0; for (const y in cnt) s += cnt[y] / N * m[y];
      return N ? s : null;
    }
    /** How prominently a game carries the given tags: Steam lists tags by votes, so earlier = more defining. 0..1 */
    function prominence(r, tags) {
      const ids = tags.map(t => tagId.get(t)); let s = 0;
      for (const id of ids) { for (let j = tagOff[r], p = 0; j < tagOff[r + 1]; j++, p++) if (tagIds[j] === id) { s += 1 / (1 + p / 4); break; } }
      return ids.length ? s / ids.length : 0;
    }
    // ---- recommendations for players ----
    let idf = null, gemPool = null;
    // rating shrunk toward a typical 80% with a prior worth 20 reviews: 54 reviews at 100% should not beat 150k at 98%
    const srate = r => (C.pos[r] + 16) / (C.reviews[r] + 20);
    const vecCache = new Map();
    function tagVec(r) {   // tag -> weight: rarer tags and tags higher in Steam's vote order count more; outcome tags are skipped
      const hitc = vecCache.get(r); if (hitc) return hitc;
      if (!idf) { idf = new Float64Array(tagNames.length); for (let t = 0; t < tagNames.length; t++) idf[t] = Math.log(n / Math.max(1, postOff[t + 1] - postOff[t])); }
      const v = new Map(); let W = 0;
      for (let j = tagOff[r], p = 0; j < tagOff[r + 1]; j++, p++) { const t = tagIds[j]; if (outcome.has(t)) continue; const x = idf[t] / (1 + p / 4); v.set(t, x); W += x; }
      const out = { v, W }; vecCache.set(r, out); return out;
    }
    function tagSim(a, b) {   // weighted Jaccard of two tagVecs
      let mn = 0; for (const [t, x] of b.v) { const y = a.v.get(t); if (y) mn += Math.min(x, y); }
      return mn ? mn / (a.W + b.W - mn) : 0;
    }
    const pctlOf = sorted => v => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; } return sorted.length ? lo / sorted.length : 0; };
    /** Recommend games from a player's seed games.
        dims: {tags, price, rating, gems} booleans. For each candidate and each seed, the enabled dimensions are scored
        0..1 and averaged; the candidate's score is 0.75 x best seed + 0.25 x second best (agreement between seeds helps).
        The final k are picked greedily with a diversity penalty so they are not all one subgenre. */
    /** only: optional rows to choose from (e.g. one tag). With no seeds but `only`, the best rated of those rows. */
    function recommend(seeds, dims = { tags: true, price: false, rating: true, gems: false }, k = 6, only = null) {
      if (!gemPool) {
        gemPool = filter(all(), r => C.reviews[r] >= 50 && (C.flags[r] >> SAFE) & 1);
        const sortedOf = f => Float64Array.from(gemPool, f).sort();
        gemPool.pPrice = pctlOf(sortedOf(r => price[r])); gemPool.pRate = pctlOf(sortedOf(srate));
        gemPool.pRev = pctlOf(sortedOf(r => C.reviews[r]));
      }
      const P = gemPool, seedSet = new Set(seeds), seedNames = new Set(seeds.map(r => name(r)));
      const S = seeds.map(r => ({ r, vec: tagVec(r), pp: P.pPrice(price[r]), pr: P.pRate(srate(r)) }));
      const on = Object.keys(dims).filter(d => dims[d]);
      const onlySet = only ? new Set(only) : null;
      if (!on.length || (!S.length && !onlySet)) return [];
      const cands = [];
      for (let i = 0; i < P.length; i++) {
        const r = P[i]; if (seedSet.has(r) || seedNames.has(name(r)) || (onlySet && !onlySet.has(r))) continue;
        const vec = tagVec(r), pp = P.pPrice(price[r]), pr = P.pRate(srate(r)), prev = P.pRev(C.reviews[r]);
        const gem = pr * (prev < .75 ? 1 : (1 - prev) / .25);   // well rated and not widely known (bottom 75% by reviews)
        const per = S.length ? S.map(s => {
          const d = { tags: tagSim(s.vec, vec), price: 1 - Math.abs(pp - s.pp), rating: pr >= s.pr ? 1 : 1 - (s.pr - pr), gems: gem };
          return { d, score: on.reduce((a, k2) => a + d[k2], 0) / on.length };
        }) : [{ d: { rating: pr, gems: gem }, score: dims.gems ? (pr + gem) / 2 : pr }];   // no seeds: best rated (or best gems) of `only`
        const ord = per.map((p, j) => [p.score, j]).sort((a, b) => b[0] - a[0]);
        const score = ord.length > 1 ? .75 * ord[0][0] + .25 * ord[1][0] : ord[0][0];
        cands.push({ r, vec, score, best: ord[0][1], per, pr, pp, prev });
      }
      cands.sort((a, b) => b.score - a.score);
      const top = cands.slice(0, 80), picks = [];
      while (picks.length < k && top.length) {
        let bi = 0, bv = -Infinity;
        top.forEach((c, i) => { const red = picks.reduce((m, p) => Math.max(m, tagSim(c.vec, p.vec)), 0), v = c.score - .3 * red; if (v > bv) { bv = v; bi = i; } });
        picks.push(top.splice(bi, 1)[0]);
      }
      return picks.map(c => {
        const s = S[c.best], shared = !s ? [] : [...c.vec.v].filter(([t]) => s.vec.v.has(t)).sort((a, b) => Math.min(b[1], s.vec.v.get(b[0])) - Math.min(a[1], s.vec.v.get(a[0]))).map(([t]) => tagNames[t]);
        return { r: c.r, score: c.score, best: c.best, seedScores: S.length ? c.per.map(p => p.score) : [], dims: c.per[c.best].d, shared,
          gem: C.reviews[c.r] < 500 && ratio(c.r) >= .9, pctl: { price: c.pp, rating: c.pr, reviews: c.prev } };
      });
    }
    function game(r) {
      return { r, appid: C.appid[r], n: name(r), y: C.year[r], rv: C.reviews[r], p: ratio(r), c: price[r], ow: owners(r),
        h: playH(r), nl: C.nlang[r], i: C.cover[r] >= 0 ? C.cover[r] : null, tags: tagsOf(r),
        hit: hit(r), hit_o: hit(r, 'hit_o'), hit_g: hit(r, 'hit_g') };
    }
    /** Case-insensitive name search, best-known first. */
    function search(text, k = 8) {
      const q = text.trim().toLowerCase(); if (!q) return [];
      const hits = [];
      for (let r = 0; r < n; r++) { const s = name(r).toLowerCase(), at = s.indexOf(q); if (at >= 0) hits.push([r, at === 0 ? 0 : 1]); }
      hits.sort((a, b) => a[1] - b[1] || C.reviews[b[0]] - C.reviews[a[0]]);
      return hits.slice(0, k).map(([r]) => r);
    }
    return { n, tags: tagNames, langs: raw.langs, feats: raw.feats, edges: EDGES, years: YEARS, shareYears: SHARE_YEARS, scope: SCOPE,
      col: C, price, all, filter, withTags, where, rate, buckets, summarize, yshare, similar, search, market, oe, ratioCI, laneYears, companions, cohort, cohortBoot, interval, marketFor, prominence, recommend, tagSim, tagVec, bucketOf: (k, v) => bucketOf(EDGES[k], v), game, name, tagsOf, hit, ratio, playH, owners, inScope };
  }
  return { open, median, quantile, bucketOf };
})();
if (typeof module === 'object' && module.exports) module.exports = GameDB;
