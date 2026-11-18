# Steam Galaxy Viz

An interactive, fully offline 3D map of Steam tags: which kinds of games get noticed, how crowded each lane is, and what the winners look like.

Every ball is a Steam tag wearing the covers of its games. Scroll to play a short story, pick a "world", explore the map, then keep scrolling for a guided rotation that walks through five findings and a summary.

![Filtered tag map](docs/map-filter.jpg)

**Open [`steam_tag_dashboard.html`](steam_tag_dashboard.html) in a modern browser.** It is one self-contained file (~30 MB, covers embedded as WebP). It needs no server and no network. WebGL2 is used when available, with a 2D canvas fallback.

English by default. Add `?lang=zh` for Chinese, or use the toggle in the corner.

> 中文简介：基于 FronkonGames/steam-games-dataset 的 Steam 标签三维星图，单个 HTML 文件，完全离线。每颗球是一个标签，球面是该标签的游戏封面。页面支持多种成功标准、小众→大众分组、精细筛选与聚焦、组 › 类别 › 游戏三级选中，以及逐步展开的数据长卷。右下角可切换中英文，也可以在网址后加 `?lang=zh`。

---

## What the map shows

| Channel | Meaning |
|---|---|
| Horizontal axis | Number of games carrying the tag (log scale), from niche to mainstream |
| Vertical axis | Success rate, judged against games released the same year by default (the simple count is one click away) |
| Depth | Share of the tag's games released in 2022 or later |
| Ball size | Number of games |
| Ball surface | Cover art of the tag's games. The ball starts on its best-known game and then rotates through its games, weighted by review count |
| Rim colour | Faction (a hand-curated family of tags, see `tag_families.csv`) |

Median rating sits on no axis on purpose. At the tag level it correlates −0.42 with success rate, so it would draw a misleading diagonal. It is shown in tooltips, cards and the detail panel instead.

### One definition of success, read two ways

Scope: tagged games released 2018–2024. A game succeeds when it reaches **500 Steam reviews**; the baseline is 9.8%.

| Reading | What it is |
|---|---|
| vs. same-year games (default; 和同年游戏比) | actual rate ÷ the rate expected from the tag's mix of release years × the baseline |
| Simple count (直接统计) | share of the tag's games with ≥ 500 reviews |

A 2018 game has had seven years to collect reviews and a 2024 game barely one: the yearly success rate of tagged games falls from 11.1% (2018) to 7.6% (2024). Tags full of recent games therefore look worse than they are. The adjustment (`scripts/derive.py`) removes release year and nothing else. Findings, badges, rankings and the summary all use the adjusted rate; the detail panel shows both, plus the expected rate.

Earlier versions offered owner- and gross-based definitions as well. They tracked the review definition closely (r = 0.84–0.88 across tags) on much coarser data, so they were removed; an upper-bound gross estimate (P90 and median) remains in the pricing chapter for reference.

## How to use it

- **Scroll** to move through the story, the world select screen, and the map. Scrolling further rotates the view through the findings. Scrolling up peels back one layer at a time.
- **Axis titles** sit on the axes when they fit on screen. When you zoom in, select a tag or turn the view so that one no longer fits, it moves to a small key at the bottom-right of the map, with an arrow showing which way that axis currently runs.
- **Hover a ball.** Its card appears on the left, highlighted and linked to the ball by a line. Pause on a ball for a moment and its most frequent co-tags stay lit while the rest dim.
- **Fine filter.** Pick several factions and set minimums for success rate, median rating and recent-release share. Each slider sits on a strip with one tick per tag, so you can see where the cut falls. Tags that don't match shrink and dim but never disappear. *Frame the result* moves the camera onto the matching tags.
- **Groups, niche → mainstream.** Five bands by number of games: < 600, 600–1,200, 1,200–2,500, 2,500–6,000, and 6,000+. Selecting a group lights its tags and opens a group panel that compares the bands and ranks the tags in the group.
- **Zoom** with the − / + / ⤢ buttons, Ctrl + wheel, trackpad pinch, or the + / − keys.
- **Selection path.** The panel header shows *Group › Tag › Game*. Each level can be cleared with ×. **Esc** or a click on empty map space steps back one level. Selecting a single game puts the rest of the map in shadow.
- **Detail panel** (3/4 of the screen). The left column holds the hero cover, the success rate (year-adjusted, raw, and expected from its release years), KPIs, achievements and a cover mosaic (tile area follows the chosen metric). The right column is a scrolling data reel: scale and trend (with success rate by release year), market share (with a growth quadrant: did a tag's share of hits keep up with its share of releases?), pricing, players and quality, and competition. Rates from small samples print a 95% interval, and rows under 100 games are faded.

## Repository layout

```
steam_tag_dashboard.html   built page (open this)
scripts/template.html      page source: CSS, HTML, JS; placeholders __DATA__, __ASSETS__, __FAMILIES__, __I18N__
scripts/i18n_en.json       Chinese → English dictionary for static text and data labels
scripts/derive.py          derived metrics (year-adjusted success, growth), applied at build time; also writes tag_metrics.csv
scripts/*.py               data pipeline (see below)
tag_families.csv           tag → faction mapping (hand-edited)
data/dash_offline.json     per-tag aggregates, ready to build
data/assets.json           embedded covers (WebP, base64)
data/games.json            per-game table for ad-hoc queries (tag combos, plans, similar games)
scripts/db.js              in-browser query engine over data/games.json
scripts/test_db.js         parity test: db.js must reproduce the per-tag aggregates
steam_eda_report.md        first-round exploratory analysis (Chinese)
tag_metrics.csv            one row per tag with the page's main metrics (python scripts/derive.py data/dash_offline.json tag_metrics.csv)
tag_stats.csv, charts/     static outputs of the first-round EDA (older definitions)
```

## Rebuilding

Only the page changed (template, translations, factions):

```bash
python scripts/build.py scripts/template.html data/dash_offline.json data/assets.json steam_tag_dashboard.html
```

The full pipeline from raw data (Python 3.12, `pip install -r requirements.txt`):

1. Download `games.csv` from the Hugging Face dataset [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset). The CSV is used rather than the Parquet file, because the tag column is empty in the Parquet version.
2. `python scripts/clean.py games.csv clean.pkl` normalises the columns, parses lists, and derives year, review count and rating.
3. `python scripts/export.py clean.pkl dash.json` builds per-tag aggregates for tags with ≥ 300 games from 2018–2024: success rate (raw and year-adjusted), market share, pricing, playtime, features, competition, co-tags, and top games.
4. `python scripts/families.py dash.json tag_families.csv` drafts the faction mapping. **Skip this step** if you want to keep the hand-edited `tag_families.csv`.
5. `python scripts/covers.py dash.json covers_cache data/dash_offline.json data/assets.json` downloads covers once from the Steam CDN, caches them, shrinks them, and replaces URLs with asset indices. This is the only step that touches the network.
6. `python scripts/export_games.py clean.pkl data/dash_offline.json data/games.json` writes the per-game table: every tagged game (83k), with columns as base64 typed arrays and success flags computed once in Python. It reads thresholds, outcome tags and cover indices from `dash_offline.json`, so run it after step 5.
7. `node scripts/test_db.js data/games.json data/dash_offline.json` checks that `scripts/db.js` reproduces every per-tag aggregate (n, three success rates, price and language buckets, features, playtime, yearly share). Run it whenever `export.py`, `export_games.py` or `db.js` changes.
8. Run `build.py` as above. The games table and `db.js` are inlined only where the template contains `__GAMES__` and `__FILE:db.js__`.

Optional EDA: `scripts/overview.py`, `scripts/tags.py clean.pkl tag_stats.csv`, and `scripts/charts.py clean.pkl tag_stats.csv charts`.

### Tuning

- **Scroll pacing** lives in `PACE` near the top of the script in `template.html`. `dist` sets how many screens each phase lasts. `speed` maps wheel speed to page speed for each zone.
- **Factions:** edit `tag_families.csv` and rebuild.
- **Wording:** Chinese strings are the source. Edit `scripts/i18n_en.json` for English static text. Sentences with numbers are written inline with `tx(zh, en)`.

## Caveats

- All comparisons are correlations, not causes.
- The dataset has no wishlists, first-week sales, review velocity around launch, or real sales figures. "Success" can only mean lifetime review count.
- Cover art, the mosaic, and the most-reviewed games and developers are drawn from all years; every other figure covers 2018–2024.
- Popular games carry more tags, so niche tags show higher success rates overall. Relative order is more reliable than absolute values.
- "Outcome" tags such as *Great Soundtrack* or *Classic* are often added after a game succeeds. They are hidden by default and can be shown from *Filter & search*.
- Games released in 2025 have not had time to collect reviews, so they are excluded from the success-rate analysis.
- Group values are medians across the tags in a group, not a deduplicated rate over all their games.

## Credits

- Data: [FronkonGames/steam-games-dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset), a snapshot from about March 2026. Owner bands come from SteamSpy via that dataset.
- Game cover images are © their respective publishers. They are embedded as small thumbnails only to illustrate each tag. Remove `data/assets.json` and the built page if you need an image-free distribution.
