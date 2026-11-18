# 013 重跑管线会让 Studio 的数据导出失败

| 字段 | 值 |
|---|---|
| 状态 | open |
| 优先级 | P1 |
| 类型 | data |
| 创建 | 2026-11-18 |
| 更新 | 2026-11-18 |
| 涉及文件 | scripts/export.py, scripts/export_games.py, scripts/test_db.js |
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
