# 开发状态

更新：2026-11-14。本文记录当前范围、评测证据和待办。Agent 设计与改进计划见 [shell-roadmap.md](shell-roadmap.md)，开发约束见 [app/AGENTS.md](../app/AGENTS.md)。

## 当前能力

| 范围 | 已实现 |
| --- | --- |
| 创作与版本 | 对话创作、草稿/已提交版本、撤销、对比、卡带导出与会话恢复 |
| 测试与观察 | `p8 check`（lint、启动、冒烟输入、`checks.json` 用例）、`p8 run --press --read`、`p8 look`（32×32 字符画、512 PNG） |
| 状态与日志 | `--read` 状态读取、printh 日志、测试路线回放记录与覆盖事实 |
| Agent | pi-durable read/write/edit/bash + just-bash + `p8`（独立 Worker）+ pico8 skill；资源是 `/cart` 下的 gfx/gff/map/sfx/music.txt |
| 评测 | 两个保留案例、S4 射击新建/修复、独立玩法检查、模型矩阵与图像对照 |
| 界面 | 中英文切换；我的卡带重命名/复制/可撤销删除/批量保存；社区卡带与 Lodge Podge 示例 Remix；拖入 `.p8` / `.p8.png` 试玩与导入；分享卡片与图标 |

播放器版本由 [`app/player.lock.json`](../app/player.lock.json) 确定，升级方式见[开发指南](development.md#player-updates)。Maker 不维护自己的 VM 分支。

## Agent

只有一条流程：Pi coding agent 的形态（通用工具 + `p8` 命令 + skill），代码在 `app/src/pico8/shell/`，与 `lab/local-agent` 共用。2026-11-14 删除了此前的结构化工具流程（最后状态见标签 `agent-flow-freeze-2026-11-13`），旧会话记录清空、卡带保留。迁移过程与两条流程的对比见 [shell-flow-migration.md](shell-flow-migration.md)。

面向模型的行为（启动段、skill、p8 输出、工具）只因评测或测试确认的问题修改，并在此记录证据与前后复跑结果。

## 验证与证据

| 记录 | 已知结论与边界 |
| --- | --- |
| S4（DeepSeek Flash high，shell，2026-11-14 累计） | 新建独立检查 15/20，修复 20/20；中位耗时新建约 85–105 s、修复约 55–70 s，全部自然结束。新建失败都是模型写的游戏不满足题面细节（受伤闪烁/像素契约、无敌时长、胜利路线结局错误） |
| 同期结构化工具流程对照 | 新建 5/5（4 次撞 180 s 时限）、修复 5/5，耗时与 token 约为 shell 的两倍；详见迁移文档 |
| Sweet Garden / Lodge Podge 复跑 | 通用结果重放（`result-replay.mjs`）复核 12 个归档：Lodge 6/6 正常路线到达胜利并重开；Garden 2/6 到达胜利；失败路径都未被正常路线覆盖。趣味性仍需人工试玩 |
| 主界面烟测（`app-smoke.mjs`） | 主页 → MAKE → 工作台，约 1 分钟提交、试玩帧时间线正常，无控制台问题 |
| lab T1–T8 | 每次 skill/p8 改动跑一次，8/8（T8 为无胜负的画画玩具） |
| P1 后 S4 ×5 | 新建 4/5、修复 5/5，中位 62 / 35 s；主界面烟测两次均只产生 v1 |
| P2-8 后 S4 ×5 | 资源改为文件后新建 5/5、修复 5/5；lab T1–T9 9/9 |
| P2-4 后 S4（新建 ×10、修复 ×5） | 新游戏先把精确规则写成 `checks.json` 用例（含像素期望）：新建 10/10、修复 5/5，中位 92 / 66 s |

普通 CI 和部署 smoke 使用脚本模型与真实 WASM，证明集成可用，不证明模型质量。都是小样本，不是统计结论。详细归档（含失败）在忽略的 `.cache/evaluations/` 与 `.cache/lab/`；命令见[评测指南](../app/scripts/evaluation/README.md)。案例报告 [Sweet Garden](sweet-garden-case-study.md)、[Lodge Podge](lodge-podge-case-study.md) 记录的是旧流程的结果。

## 后续工作

按 [shell-roadmap.md](shell-roadmap.md) 推进：P0（删除旧流程）、P1（`g`/`g.mode` 可选、`p8 --setup`、每次请求一个版本）与 P2（知识回迁、题面要求写成检查、`look --crop`、四项交付格式、资源即文件）已完成；下一步 P3：评测分层、案例的通用重放检查、预取 shell 与 p8 Worker、纯文本模型验证。
