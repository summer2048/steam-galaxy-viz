# 013 重跑管线会让 Studio 的数据导出失败

| 字段 | 值 |
|---|---|
| 状态 | done |
| 优先级 | P1 |
| 类型 | data |
| 创建 | 2026-11-18 |
| 更新 | 2026-11-18 |
| 涉及文件 | scripts/defs.py, scripts/export.py, scripts/export_games.py, scripts/test_db.js |
| 关联 | 005, 010 |

## 背景
005 精简指标时，export.py 不再输出持有量和流水两种成功标准（`hit_o`、`hit_g`，以及 `meta.own_t`、`meta.gross_t`）。同一时间本地在做 Studio，它按游戏逐条保留了三种标准。两边合并时，现有的 `data/dash_offline.json` 仍是旧版 export.py 生成的，所以目前一切正常。

## 证据（代码判断，未重跑管线）
- `scripts/export_games.py` 第 14 行读取 `dash['meta']['own_t']` 和 `gross_t`。用新版 export.py 重跑后这两个键不存在，会报 KeyError。
- `scripts/test_db.js` 拿 db.js 的结果和 dash_offline.json 里每个标签的 `hit_o`、`hit_g` 对比，重跑后会失去对照。

## 建议
二选一：
1. export.py 继续在 `meta` 里写入两个阈值（只是常量，不影响星图），test_db.js 只对比星图里仍有的字段，持有量和流水改为抽查。
2. 把阈值移到一个共享常量（例如 scripts/defs.py），export.py 和 export_games.py 都从这里读取。

完成 010（重跑管线）之前要先处理。

## 处理结果（2026-11-18）
按建议 2 处理。新增 `scripts/defs.py`，集中放三个阈值（评价 500、持有量 20 万、流水 $100 万）。export.py 和 export_games.py 都从这里读取。export.py 同时把阈值写进 `meta` 作为记录。若 dash 文件里的阈值和 defs.py 不一致，export_games.py 会报错，提示重跑 export.py。test_db.js 跳过新版导出里已经没有的字段，并把跳过了哪些打印出来。

**实测**（Windows Python 3.12、pandas 3.1.1，数据用 lofi-prototype/clean.pkl）：
- 新版 export.py 跑通，309 个标签，基准成功率 0.0978，meta 里有三个阈值。
- 模拟新版导出（去掉 own_t、gross_t、hit_o、hit_g、own_med）：旧版 export_games.py 报 `KeyError: 'own_t'`，旧版 test_db 报字段不一致；新版 export_games.py 生成的游戏表与已提交的 data/games.json 完全相同（meta 除外），新版 test_db 通过，并提示跳过了 hit_o、hit_g、own_med。
- 阈值不一致时，export_games.py 会给出明确的报错。

**未覆盖**：covers.py 需要联网，本次没有跑完整管线（见 010）。持有量和流水两种标准今后只能靠 Python 端的逐游戏标记保证，test_db 不再有逐标签的对照。
