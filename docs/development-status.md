# 开发状态

更新：2026-11-13。本文记录当前范围、冻结约束和待办。工具行为以[知识库与宿主契约](pico8-agent/README.md)为准，开发约束见 [app/AGENTS.md](../app/AGENTS.md)。

## 当前能力

| 范围 | 已实现 |
| --- | --- |
| 创作与版本 | 对话创作、草稿/已提交版本、撤销、对比、卡带导出与会话恢复 |
| 输入与观察 | steps 输入、执行前整批校验、PNG 最近邻 ×4、屏幕交集裁剪 |
| 状态与日志 | 有界状态读取/调试、printh 日志、正常路线与 debug 路线区分 |
| Agent 流程 | 固定启动前缀、按需参考、重开骨架、音频触发与版本覆盖事实 |
| 评测 | 两个保留案例、S4 射击新建/修复、独立玩法检查、模型矩阵与图像对照 |
| 界面 | 中英文切换；我的卡带重命名/复制/可撤销删除/批量保存；社区卡带与 Lodge Podge 示例 Remix；拖入 `.p8` / `.p8.png` 试玩与导入；分享卡片与图标 |

播放器版本由 [`app/player.lock.json`](../app/player.lock.json) 确定，升级方式见[开发指南](development.md#player-updates)。Maker 不维护自己的 VM 分支。

## Agent 流程

**默认：shell 流程**（2026-11-14 决定，依据见 [shell-flow-migration.md](shell-flow-migration.md)）。新会话使用 pi-durable 的 read/write/edit/bash、`p8` 命令和 pico8 skill，资源仍用 `read_assets`/`edit_assets`；p8 跑通 `main.lua` 后经 `load_game` 提交版本，测试路线经 `reset_game`/`press_buttons` 记录。

**回退：冻结流程**，标签 `agent-flow-freeze-2026-11-13` 与播放器 `69521e7`（标签同名）。有历史、没有存储 flow 的旧会话继续用它；`?flow=frozen` 可让新会话使用它。冻结范围包括工具/schema、结果 DTO、启动段 AGENT/MACHINE/WORKFLOW/Host、重开骨架、图像裁剪、音频事件与覆盖提示。

两条流程面向模型的行为都只因评测或测试确认的问题修改，并在此记录证据与前后复跑结果。UI、文档和评测工作可独立进行。删除冻结流程需要单独决定。

## 验证与证据

| 记录 | 已知结论与边界 |
| --- | --- |
| [冻结基线](tooling-baseline.json)与 [Sweet Garden](sweet-garden-case-study.md)、[Lodge Podge](lodge-podge-case-study.md) | 保留版本、模型配置、归档/卡带 hash、失败及独立路线；旧版单模型案例不代表当前流程效果 |
| 2026-11-13 两案例复跑 | `deepseek-flash` high，各一次样本；工具调用 Garden 176→56、Lodge 157→72。Lodge 最终版本有正常胜利/重开；Garden 最终版的 Agent 胜利检查含 debug，独立重放正常前缀可胜利。不是统计结论 |
| [S4 评测](s4-evaluation.md) | 冻结版本各 3 次：修复 3/3、新建 2/3 通过独立检查；另一次新建在首次工具调用前超时。原始失败与复核结果分别保留 |
| 图像对照 | 128/512 的三次 6×6 棋盘识别均为 36/36，不能据此推断分辨率优势 |
| 真实浏览器烟测 | 冻结版本接水果任务完成正常胜利、失败和重开，页面无异常；属于一次有界样本 |

普通 CI 和部署 smoke 使用脚本模型与真实 WASM，证明集成可用，不证明模型质量。音频事件证明调用和声道分配，不证明听感。状态读取尚未被对照实验证明能提高整体通关率或降低总成本。

历史复跑中确认的覆盖统计修正计入首个 debug 事件之前的正常输入前缀，声明 debug 开局的路线不计；整轮仍保留 debug 标记。S4 验证器相应修正了结算短锁等待与正常前缀重放，并通过原始归档复核，未覆盖原始报告。

[完整历史记录](https://github.com/boxuechen/pico8-maker/blob/f84d09db0e1bf73465ebaf23a414873f009ae27a/docs/development-status.md)保留各次耗时、费用估算、错误、归档位置和复核过程。详细模型归档（含失败）仍在忽略的 `.cache/evaluations/`；复算命令见[评测指南](../app/scripts/evaluation/README.md)。

## 后续工作

- **Shell 流程跟进：** 已转为默认。主界面端到端已用 `app-smoke.mjs` 跑通（v4 提交、试玩帧时间线、无控制台错误）。仍待做：(1) 模型用临时改代码代替 debug 测试，会在撤销历史里留下临时版本；(2) 案例 Garden/Lodge 最终版本的人工试玩对比；(3) S4 新建失败集中在题面细节（受伤闪烁、无敌时长），需要靠更多样本或 skill 内容改进再验证；(4) shell 下没有 debug 写状态、ASCII 裁剪观察和 `/cart/playtests.json`，按实际失败再补。
- **扩展效果验证：** 在已有 S4 小样本基础上固定 prompt/runtime/知识/预算，增加重复次数与不同 provider；分别报告 Agent 正常路线和独立验证，保留失败。
- **首版延迟：** 新建任务存在长时间思考、首次加载迟的情况。缩小首版规模或调整思考强度需要独立对照，冻结期内不直接改流程。
- **纯文本模式：** 当前要求图像与工具调用。后续需验证 text+tools、vision+tools、跨模式恢复和正常输入通关；纯文本请求不能携带 image block，视觉检查须明确未验证。
- **按实际失败扩展：** 跑酷、节奏、连续帧检查和音频观察仍为候选，以质量证据决定优先级。

更早的计划和实施日志可从 `b25cc9b`、`5d7bb30`、`212d162` 追溯；这些历史材料不是当前实现授权。
