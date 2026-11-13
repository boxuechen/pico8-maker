# 开发状态与后续工作

更新：2026-11-13。本文保留已落地的决策和待办；工具细节以[知识库与宿主契约](pico8-agent/README.md)为准，开发约束见 [app/AGENTS.md](../app/AGENTS.md)。

## 已实现

| 范围 | 当前能力 |
| --- | --- |
| S0：基线 | 两个真实创作案例的版本、模型、归档与卡带 hash，以及按 tool-call ID 去重的指标 |
| S1：输入与观察 | 唯一 steps 输入、执行前整批校验、PNG 最近邻 ×4、屏幕交集裁剪、精简结果；预算仅随源码读取和 load 返回 |
| S2：状态与日志 | inspect_game 只读查询/有界调试、printh 日志、debug 整轮标记；每次 load/reset 新建 session 与内存存档 |
| S3：创作流程 | AGENT → MACHINE → WORKFLOW → 调色板 → Host 静态前缀，动态 Project 最后；统一流程与可运行重开骨架，参考按需读取 |
| S4：结果评测 | 两波射击新建/修复、独立状态与画面验证、Agent 正常路线覆盖、模型矩阵、128/512 同棋盘对照入口 |

播放器依赖版本见[根 README](../README.md)，来源和校验规则见 [SOURCES](pico8-agent/SOURCES.md)。底层能力在独立播放器仓库提交并构建 release，Maker 再接入；不在 Maker 维护私有 VM 分支。

执行链为 tool → Game → test Worker → standalone session → shared runtime → bridge。查询只读全局可达值，raw table 访问不执行元方法；受限 debug 在安全帧边界执行，不隐式推进 update/draw。查询限额为 16 条路径、16 段/路径、4 层、512 entries、16 KiB 输出；debug 为 4 KiB 源码、50,000 指令，代码和键使用 Lua byte string。ABI 为 `0x00010006`。

任何 debug 尝试都在 dispatch 前标记整轮，包括语法错误、取消和未知结果。执行失败可能保留部分赋值，需 reset；stateSeq 与 frameStateSeq 区分注入后的状态和旧画面。实时试玩、源码资源和导出保持隔离。记录格式 v3，不转换旧格式，不恢复旧 skill 路由或 replay 工具入口。

### 2026-11-13 工具与知识调整

- 重开骨架与三个示例统一为全局 `g` + `new_game()`，X 重开并在结算后锁定 15 帧；按住主动作键（O）不会跳过结算。
- 模型图像结果头带 `imageScale:4`，区域坐标明确为原生 128 像素；load/reset/input 不再重复全屏 `format/region`，`cpuInstructions` 仅随慢帧返回，内部序号改为 `staleFrame` 提示。
- 状态读取把完整序列压成数组、字符串键表压成对象（8×8 棋盘的完整读取结果从 1851 降至 268 UTF-8 bytes），稀疏/混合/截断表保留 entries。
- 调试执行出错后仍可只读查询（播放器 `96e19b9` 放开 VM 门控），继续输入或调试仍需 reset；编译失败的调试块不执行，不再标记整轮 debug。
- 发往模型的请求省略之前用户请求中的工具截图，本次请求保留最新 16–31 张（按 16 张分段移动，保持前缀稳定）；存储记录与 UI 保留全部图片。
- 配色表改为明暗对比规则与暗/亮两套起点；重复的 debug 规则从宿主说明和工具描述中删除；读取路径 schema 用 `anyOf`。

### 2026-11-13 音频触发与覆盖提示

- 播放器 `69521e7`：inspection session 的 advance 返回 guest `sfx()/music()` 启动事件（实际声道、是否占用音乐声道 `overMusic`），每次最多 32 条。Maker 在 load/reset/input 结果中附 `audio` 块，模型可验证音效触发和声道分配；听感仍属未验证。
- 每次提交新版本时，load_game 说明当前版本的正常输入路线数量，以及上一版本的正常路线需要在新版本重跑；每次请求的项目上下文也带当前版本覆盖事实。只陈述事实，不自动续跑、不判定通过。

## 验证与证据边界

S0–S3 的历史验证覆盖真实 WASM/Worker、状态读取与调试边界、日志限额、裁剪与 512×512 输出、正常输入/重开、版本隔离，以及知识包顺序、hash、链接、Lua receipt 和实际 Pi compaction。播放器当时通过 281 项 runtime 与 16 项 architecture/public-export 检查、构建校验和两次干净构建一致性检查；Maker 通过相关定向检查、浏览器烟测与生产构建。各批次有重叠，不合计成当前全量测试通过数。

固定空卡带的普通 observation 头部从 711 降至 197 UTF-8 bytes；这是编码体积测量，不证明总调用成本或模型识别率改善。旧案例通过 Game 工具重放的 78 个调用终点 frame hash 一致，原始证据在 `.cache/p0-p2/`。

S4 的实现、指标定义、运行方法及 21 项关键回归范围集中在 [S4 评测](s4-evaluation.md)。脚本 provider 仅证明管线可用。真实 Kimi 请求被订阅权限 403 拒绝，其他 provider 未运行；后续真实模型与图像对照按要求跳过。尚无证据证明状态查询提高通关率、减少总成本，或 512 图像识别优于 128。

## 冻结基线

[tooling-baseline.json](tooling-baseline.json)保留历史 Maker/runtime 版本、模型配置、知识版本、归档 hash、最终卡带与独立证据 hash。

| 案例 | 工具调用 | 观察 | 单行观察 | 工具错误 | 文本 UTF-8 bytes | 图像 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sweet Garden | 176 | 88 | 68 | 2 | 267300 | 119 |
| Lodge Podge | 157 | 27 | 0 | 10 | 238988 | 215 |

累计归档按 tool-call ID 去重，不直接累加各轮历史。复算需要本机保留的两份原始归档：

```sh
node app/scripts/evaluation/freeze-tooling-baseline.mjs --check
```

案例的提示词、失败、独立路线与局限见 [Sweet Garden](sweet-garden-case-study.md) 和 [Lodge Podge](lodge-podge-case-study.md)。这些是旧版流程的单模型样本，不是当前 Workflow 的效果结论。

## 改造后真实模型复跑（2026-11-13）

用 `app/scripts/evaluation/run-case.mjs`（正式 Agent/知识/工具/Worker 协议，Node 传输，一次性卡带）按基线相同的两轮提示词、`deepseek-flash`（DeepSeek V4.1 Flash，图像输入）/ high、每轮 15 分钟、无工具次数上限，重跑两个案例。知识版本 `pico8-files-v1-5c85adc2b37a7c45`。每案例一次样本，模型输出非确定，结果只说明方向，不是统计结论。

| 案例 | 版本 | 工具调用（轮1+轮2） | observe | 单行扫描 | 状态读取 | 工具错误 | 结果文本 | 图像 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sweet Garden | 基线 | 176（127+49） | 88 | 68 | 0 | 2 | 267 KB | 119（128²） |
| Sweet Garden | 复跑 | 56（45+11） | 0 | 0 | 15 | 1 | 35 KB | 30（512²） |
| Lodge Podge | 基线 | 157（70+87） | 27 | 0 | 0 | 10 | 239 KB | 215 |
| Lodge Podge | 复跑 | 72（42+30） | 4 | 0 | 17 | 0 | 34 KB | 42（512²） |

耗时：Sweet Garden 730 s + 124 s（基线 733 s + 252 s）；Lodge Podge 545 s + 540 s（基线 549 s + 619 s）。首个可玩版本时间相近（250–264 s）。

正常路线：

- **Lodge Podge**：两轮最终版本都由 Agent 以正常输入走通胜利与 X 重开（第二轮 r9，10 次输入调用，无 debug）。独立重放该路线于最终卡带，实际帧为 `LODGE BUILT!`、木棍/泥/树叶 4/4、3/3、4/4，重开后 0/4、0/3、0/4 并显示操作说明。基线两轮均靠预置进度验证。
- **Sweet Garden**：第一轮 Agent 用状态读取规划交换，以正常输入达到 710/700 胜利并重开，随后在同一路线注入 1 步验证失败；整轮因此标为 debug。第二轮只改画面和开场卡，胜利用 debug 预置 690 分验证，并在交付中如实写明 r5 没有纯正常胜利。独立重放第一轮的 15 个正常输入调用：r4 与最终 r5（先按 Z 关闭新增开场卡）都在第 13 次调用到 `win 710`，重开恢复 0 分 / 20 步。
- 两个案例交付都使用四项格式，音效触发帧与声道来自新的 audio 事件，听感列入未验证。

据此修正：覆盖统计改为计入首个 debug 事件之前的正常输入前缀（debug 事件记录 `afterCalls` 与开始时的 purpose），声明 debug 的 reset 不计入；整轮仍标 debug。这样 Sweet Garden 第二轮提交时会提示「上一版本有正常路线，需在本版本重跑」，而基线判断（不能把注入后的结果算作正常）不变。归档：`.cache/evaluations/case-sweet-garden-90833007-…/`、`.cache/evaluations/case-lodge-podge-cd504775-…/`。

## 冻结（2026-11-13）

Agent 流程冻结于 Maker 标签 `agent-flow-freeze-2026-11-13` 与播放器 `69521e7`（标签同名）：工具与 schema、结果 DTO、启动段 AGENT/MACHINE/WORKFLOW/Host、重开骨架、图像裁剪、音频事件与覆盖提示。此后只因评测或测试发现的缺陷修改，并在本文记录证据与前后复跑结果；评测、报告与 UI 工作不受影响。

## 后续工作

- **S4 实际效果验证**：配置可用服务后，固定 prompt/runtime/知识/预算，先各跑一次射击修复与新建，再增加不同 provider；保留全部失败，Agent 正常路线与独立验证分栏。图像对照每分辨率仅一次请求，不能推断统计优势。
- **S5 纯文本模式**：以工具能力为前提区分 text/vision；text 默认状态/日志、按需 ASCII 和资源文本。消息编码统一处理工具结果、历史截图、压缩和连接测试，确保纯文本请求无 image block；切换模型重建兼容上下文且保留原始记录。分别验证 text+tools、vision+tools、跨模式恢复和正常输入通关，明确视觉检查未验证。
- **按实际失败扩展**：跑酷、节奏、连续帧审查和音频观察仍是候选；不以增加工具、文档或题材数量代替质量评估。

## 历史追溯

清理前的完整计划、实施日志、ModRetro 调研和早期评测表保存在提交 `b25cc9b`，例如 `git show b25cc9b:docs/tooling-progress.md`。更早的知识研究报告与退役比较脚本见 `5d7bb30`；经典游戏长篇研究见 `212d162`。详细模型归档（包括失败）继续保留在忽略的 `.cache/evaluations/`。
