# 014 可用性走查：三个任务的模拟测试（非真人）

| 字段 | 值 |
|---|---|
| 状态 | done |
| 优先级 | P1 |
| 类型 | ux |
| 创建 | 2026-11-18 |
| 更新 | 2026-11-18 |
| 涉及文件 | docs/usability/README.md, scripts/studio.js, scripts/template.html |
| 关联 | 015–021 |

## 背景
真人测试需要招募参与者，本轮先做**模拟走查**：用无头 Chrome 按任务卡的路径截图和量测，再请 Codex（gpt-6.2-astra，high）按认知走查法逐步回答四个问题（会不会尝试正确操作、会不会注意到、能否联系到目标、能否看懂反馈）。结论是**预测**，必须用 `docs/usability/` 的工具包做真人测试来确认。

## 证据
- 截图：Studio 选赛道（Card Game、Card Game + Deckbuilding）、比较方案（Deckbuilding + Rogue-lite）、玩家空状态和三款示例推荐，1280 px，英文。
- 量测：页面打开时角色入口在第 7.3 屏（`#stEntryDev` 距顶 5,813 px，视口 801 px）；“跳过开场”直接到星图，越过角色入口（`scripts/template.html:2541`）。
- 手输 `#studio/lane/Card+Game/r` 被拆成未知标签 Card、Game，显示 0 款和“不挤 · 在变空”。
- 预测结果：T1 能完成，读对有风险（变挤和优势缩小在同一张图里方向相反）；T2 容易选 A，但未必说出区间和相关性；T3 能完成并读对。

## 建议
拆成 015–021 逐个处理。真人测试按 `docs/usability/README.md` 进行，结果另记新 issue。

## 验收标准
- [x] 工具包：主持人脚本、任务、读对标准、记录表（`docs/usability/`）。
- [x] 走查发现全部拆成独立 issue。
- [ ] 至少 3 位真人参与者完成测试（需要人工安排，不在本 issue 关闭条件内，另开 issue 跟踪）。

## 记录
- 2026-11-18：模拟走查完成，拆出 015–021。
