# 010 重跑管线，验证 export.py 的改动

| 字段 | 值 |
|---|---|
| 状态 | done |
| 优先级 | P2 |
| 类型 | data |
| 创建 | 2026-11-14 |
| 更新 | 2026-11-18 |
| 涉及文件 | scripts/export.py, data/dash_offline.json |
| 关联 | 002, 005, 006, 007, 008 |

## 背景
002 和 005 改了 `export.py`，但这些改动没有运行过：仓库里没有 `games.csv` / `clean.pkl`，本机的 Python 也没有 pandas 和 pip。目前只通过了 `py_compile`。

页面本身不受影响：`build.py` 通过 `derive.py` 从现有的 `data/dash_offline.json` 算出所有新字段。

## 证据
`export.py` 的改动：
- 删除 `hit_o`、`hit_g`、`own_med`、`own_b`、`share.revenue`、`share.ccu`、`pstat.on_sale`、`pstat.disc`，以及 `meta.own_t`、`meta.gross_t`。
- 新增 `base.year_t`（有标签游戏的逐年游戏数和成功数）。
- 输出前调用 `derive()`。

## 建议
1. 按 README 的步骤 1–3 重跑，确认 `export.py` 能跑通。
2. 对比新旧 `dash.json`：`base.year_t` 应该和 `derive.py` 反推的值几乎一致（2018–2024：7183, 6674, 8021, 8563, 8729, 9790, 12581）。如果数据集快照更新了，数字会整体变化，这时以新数据为准。
3. 趁这次重跑做 006 的剩余项、007、008。

## 验收标准
- [x] `export.py` 在真实数据上跑通，`data/dash_offline.json` 更新。
- [x] `hit_adj` 在重跑前后的差异有记录。

## 记录
- 2026-11-14：创建。
- 2026-11-18：用 lofi-prototype/clean.pkl（125,855 款）和 Windows Python 3.12 + pandas 重跑步骤 3–7：export.py → covers.py → export_games.py → test_db → build。export.py 在真实数据上跑通。新旧对比：309 个标签集合和游戏数完全一致；base.year_t 与 derive.py 反推值只有 2019 年游戏数差 2（6,672 vs 6,674），成功数全部一致；hit_adj 新旧差的中位数 0、最大 0.0001（Hex Grid 0.1162 vs 0.1163），没有标签超过 0.005。002/005 的字段改动（删掉的 share/pstat 字段等）现在真正写进了 data/dash_offline.json。assets.json 和 games.json 与重跑前逐字节相同。e2e 31 项中英文通过。
- 2026-11-18：更正：证据一节说删除了 meta.own_t、meta.gross_t，实际 013 为了让 Studio 的逐款导出共用阈值又保留了这两项（scripts/defs.py），重跑后的 JSON 里仍有。tag_metrics.csv 已按新数据重新生成。
