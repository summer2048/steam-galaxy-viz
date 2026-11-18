# issues

这个文件夹记录项目的已知问题、数据口径疑点和改进建议。每个问题一个 Markdown 文件，和代码一起进版本库。

## 文件命名

```
NNN-简短英文描述.md
```

- `NNN`：三位流水号，从 `001` 开始递增，不复用、不重排。
- 描述用小写英文和连字符，例如 `002-year-adjusted-success.md`。

## 文件结构

每个文件开头是一个元信息块，后面是正文：

```markdown
# NNN 标题

| 字段 | 值 |
|---|---|
| 状态 | open / in-progress / done / wontfix |
| 优先级 | P0 / P1 / P2 / P3 |
| 类型 | data（数据口径）/ viz（可视化）/ ux（交互）/ bug / docs |
| 创建 | YYYY-MM-DD |
| 更新 | YYYY-MM-DD |
| 涉及文件 | scripts/export.py, scripts/template.html … |
| 关联 | 其他 issue 编号，没有就写 — |

## 背景
发现了什么问题，为什么重要。

## 证据
数据、计算结果或代码位置（`文件:行号`）。写清楚是怎么算出来的，方便复核。

## 建议
具体怎么改。有多个方案时，写明推荐哪一个。

## 验收标准
满足哪些条件，这个 issue 就可以关闭。

## 记录
按日期追加进展，不改写旧记录。
```

## 优先级

| 级别 | 含义 |
|---|---|
| P0 | 结论可能是错的，或者页面坏了，应该马上处理 |
| P1 | 明显影响结论的可信度或可用性 |
| P2 | 能改善体验或补充信息，不影响现有结论 |
| P3 | 小问题、清理、锦上添花 |

## 规则

1. **一个文件一件事。** 一份综合评审可以先记成一个文件，开始动手前再拆成独立的 issue，并在原文件的「关联」里列出拆出去的编号。
2. **证据先于观点。** 涉及数据的结论要附上数字和计算方法，不能只写"感觉不对"。
3. **只改状态，不删文件。** 完成的写 `done`，决定不做的写 `wontfix` 并说明原因。
4. **更新时同步修改「更新」日期**，并在「记录」里追加一行。
5. **相关非因果。** 和项目其他文档一样，涉及成功率差异的描述都要注明是相关关系。
6. 文末的索引表要随文件的新增和状态变化一起更新。

## 索引

| 编号 | 标题 | 状态 | 优先级 | 类型 |
|---|---|---|---|---|
| [001](001-data-section-review.md) | 数据部分评审：口径、冗余与缺口 | done | P1 | data |
| [002](002-year-adjusted-success.md) | 年份校正成功指数 | done | P1 | data |
| [003](003-growth-quadrant.md) | 供给和成功作品的增长象限 | done | P1 | viz |
| [004](004-small-sample-intervals.md) | 小样本的置信区间 | done | P1 | data |
| [005](005-prune-redundant-metrics.md) | 精简冗余指标 | done | P2 | data |
| [006](006-consistent-year-scope.md) | 统一年份口径 | in-progress | P2 | data |
| [007](007-developer-view.md) | 开发者视角补充 | open | P2 | data |
| [008](008-hidden-gems.md) | 玩家遗珠列表 | open | P2 | data |
| [009](009-i18n-cleanup-and-csv.md) | 清理 i18n 死条目，导出标签指标 CSV | done | P3 | docs |
| [010](010-rerun-pipeline.md) | 重跑管线，验证 export.py 的改动 | open | P2 | data |
| [011](011-badge-thresholds.md) | 徽章和分级的硬阈值 | open | P3 | viz |
| [012](012-plain-wording-and-axis-titles.md) | 成功率两种算法的叫法看不懂；坐标轴标题经常不显示 | done | P1 | ux |
| [013](013-studio-vs-pruned-export.md) | 重跑管线会让 Studio 的数据导出失败 | open | P1 | data |
