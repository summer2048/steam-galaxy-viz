# 009 清理 i18n 死条目，导出标签指标 CSV

| 字段 | 值 |
|---|---|
| 状态 | done |
| 优先级 | P3 |
| 类型 | docs |
| 创建 | 2026-11-14 |
| 更新 | 2026-11-14 |
| 涉及文件 | scripts/i18n_en.json, scripts/derive.py, tag_metrics.csv, README.md |
| 关联 | 001 |

## 背景
`i18n_en.json` 里有旧版轴定义的文案；`tag_stats.csv` 是第一轮 EDA 的产物，口径已经过时。来自 001 的建议 8 和 F 节。

## 证据
判定方法：一个键既不是 `template.html` 的子串，也不是数据里 `labels` 的值，就是死条目。清理前 278 条，其中 22 条是死的（含本次删掉的指标的文案）。

## 建议
删掉死条目；用 `derive.py` 从 `dash_offline.json` 导出 CSV。

## 验收标准
- [x] 死条目已删（278 → 258 条，其中新增 2 条表头翻译）。
- [x] `tag_metrics.csv`：309 个标签，25 列，含原始和年份校正成功率、增长、份额、集中度。

## 记录
- 2026-11-14：完成。`tag_stats.csv` 没有覆盖，因为 `scripts/charts.py` 还在按旧列名读它；README 里标明了它是旧口径。生成命令：`python scripts/derive.py data/dash_offline.json tag_metrics.csv`。
