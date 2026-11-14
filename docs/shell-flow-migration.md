# Shell 流程迁移方案（待评审）

更新：2026-11-14。状态：**已实施，shell 流程为默认**（M4 决定见文末）。冻结流程保留为回退，见 [development-status.md](development-status.md#agent-流程) 与 `app/AGENTS.md` 的 Agent flows。

## 1. 结论先行

- 把 lab 的 Agent 形态（通用 read/edit/write/bash + `p8` 命令 + skill）以**新增的第二条流程** `shell` 接入 Maker，默认关闭，按开关启用；冻结流程 `frozen` 不改一行。
- **保留 pi-durable**（重试、压缩、转录恢复、STOP、顺序工具都由它负责），只换工具面和启动知识。不迁移到 lab 浏览器版用的 pi-agent-core 裸循环。
- Maker 侧**不引入 OPFS**：`main.lua` 已经由卡带存储（IndexedDB）持久化，再加一份 OPFS 会多出一个真相源。草稿文件之外的临时文件放会话内存。
- `p8` 跑在**独立的 p8 Worker** 里，每条命令一次消息往返；不在主线程起播放器，也不复用测试 Worker 的逐帧 RPC（原因见 4.2）。
- 是否转为默认，只看第 6 节的评测门槛；结果写入 development-status.md，和冻结规则的要求一致。

## 2. 证据与边界

| 来源 | shell 形态（lab） | 冻结流程（Maker） |
| --- | --- | --- |
| S4 新建，DeepSeek Flash high | Node 3/4 + 浏览器 1/1，38–126 s | 2/3，84–140 s（1 次首调前超时） |
| S4 修复 | Node 3/3 + 浏览器 1/1，53–72 s | 3/3，109–142 s |
| T1–T5 小改动 | 5/5 ×2（Node/浏览器），4–12 s | 无对应题 |

边界，必须在评审时承认：

1. 样本很小（每格 1–4 次），只能说明「不比冻结差、可能更快」，不是统计结论。
2. lab 的 skill 带有一套**游戏契约**（全局 `g`、`g.mode` 为 play/win/lose、`g.wait` 后按 X 重开，见 `lab/local-agent/skill/pico8/SKILL.md:38-45`）。S4 和 T1–T7 都贴合这套契约；Maker 产品规则要求「设计模式可选、保留宽松或表达型游戏」。去掉或放宽契约后的效果**没有证据**。
3. lab 只覆盖代码；精灵、地图、SFX、音乐编辑完全没测过。lab 每次加载都注入一套固定音效库（`lab/local-agent/src/runtime.mjs:24`、`src/sounds.mjs`），Maker 的卡带资源来自草稿。
4. ~~lab 的系统提示和工具文案来自 pi-coding-agent；Maker 用 pi-durable 的同名工具，文案不同。~~ M0 已验证：同一提示下 pi-durable 结果同档。

## 3. 现状对照

| 维度 | 冻结流程 | lab shell 形态 |
| --- | --- | --- |
| 循环 | pi-durable Harness，`app/src/agent.js:110`，`toolExecution: "sequential"` `:118` | Node：pi-coding-agent AgentSession；浏览器：pi-agent-core Agent |
| 工具 | 9 个：read、edit + 7 个游戏工具，`app/src/pico8/tools.js:21-35` | 4 个：read/edit/write/bash；游戏能力全在 `p8` 子命令 |
| 文件 | 只有 `/cart/main.lua` 可写，`/cart/playtests.json` 只读，`app/src/pico8/workspace.js:13-14` | `/cart` 全可写，`/skill/pico8` 只读 |
| 提交 | `load_game` 编译、跑 1 帧、成功则草稿→版本，`app/src/game.js:575` | 无提交概念，结束时读 `main.lua` |
| 运行时 | 测试 Worker RPC（load/advance/observe/inspect），`app/src/game.js:185-214`、`app/src/test-worker.js` | `Runtime` 直接建 inspection 会话，`lab/local-agent/src/runtime.mjs:23-103` |
| 观察 | 工具结果直接带 PNG（×4），保留最近 16–31 张，`app/src/pico8/image-retention.js:13` | `p8 look` 32×32 字符画；`--png` 写文件后用 read 看 |
| 知识 | 启动段 AGENT/MACHINE/WORKFLOW（约 10.5 KB）+ 按需参考 `/extensions/pico8/` | SKILL.md（3.1 KB）+ reference/api.md + 示例 + 模板 |
| 路线记录 | `press_buttons` 记录路线、normal/debug 标记、覆盖统计 | 无 |

## 4. 目标设计

### 4.1 结构

```
Agent (app/src/agent.js, 不变)
 └─ Harness (pi-durable, 不变)
     └─ extension: flow === "frozen" ? createPico8Extension(...)   // 现有，不动
                                     : createShellExtension(...)   // 新增
          tools: pi-durable 自带 read / edit / write / bash（tools 导出）
          env:   ShellEnv = CartWorkspace 的 FileSystem + just-bash 的 exec
          sections: skill（SKILL.md）+ host 段 + 动态项目状态（沿用现有）
```

- pi-durable 自带 `createBashTool`，执行 `api.env.exec`（`pi-durable/dist/tools/bash.js`）。`ExecutionEnv = FileSystem & Shell`；`CartWorkspace` 已实现 FileSystem（`app/src/pico8/workspace.js:43-230`），只缺 `exec`/`cleanup`。
- `ShellEnv.exec` 背后是 just-bash 的 `Bash` + `MountableFs`：`/cart/main.lua` 映射到 `game.draft.source`（读写都走 `setDraft`），`/cart` 其他文件和 `/tmp` 放会话内存，`/skill/pico8` 只读。
- just-bash 只用它的浏览器入口（约 1.2 MB），第一次选 shell 流程时懒加载。pi-coding-agent 和 lab 的 Node 垫片**都不需要**进 Maker 包。

### 4.2 `p8` 在 Maker 里的语义

`p8` 的命令解析、检查和输出文案原样沿用 `lab/local-agent/src/p8.mjs`。M1 已实现整条命令跨线程：主线程的 bash 里 `p8` 把 argv、cwd 和 `/cart` 下的文件发给 p8 Worker，Worker 跑原版 `runP8`，返回输出、退出码、新建或改动的文件，以及 run/look 实际播放的内容（按键、帧数、最后一帧 RGBA），供主线程提交版本、显示关键帧、记录路线。

不复用测试 Worker 的原因：lab 的检查每帧都读一次 `g.mode`，还会同时开多个会话（启动、空闲、每个按键各一个）；测试 Worker 每次只有一个会话，逐帧 RPC 每次还带整帧画面和日志。代价是多一个播放器 wasm 实例。

| 子命令 | Maker 实现 | 对 UI 的影响 |
| --- | --- | --- |
| `p8 check` | lint + 在 p8 Worker 加载草稿 + 冒烟输入 + `checks.json`（若存在） | 启动成功且源码有变化 → 提交新版本（同 `load_game` 的语义） |
| `p8 run --press … --read …` | p8 Worker；`onPlay` 回报按键与最后一帧 | 先按需提交；记录为 normal 路线 |
| `p8 look [--png f]` | p8 Worker；PNG 随返回的文件写回会话内存 | 不提交 |
| `p8 new <template>` | 写入草稿；模板自带的音效写进草稿资源，而不是每次加载时注入 | 草稿变化 |
| `p8 export` | 走现有导出 | 无 |


### 4.3 需要评审拍板的决策

| # | 问题 | 推荐 | 理由 |
| --- | --- | --- | --- |
| D1 | 循环用 pi-durable 还是 pi-agent-core | **pi-durable** | 重试、压缩、转录 v3 恢复、STOP 都是 Maker 的硬约束；M0 证明它不影响效果 |
| D2 | 什么时候提交版本 | **p8 加载成功且源码 hash 变化时提交**，同一请求内去重 | 和 `load_game`「成功才提交、失败保留草稿」一致；预览、导出、撤销不用改 |
| D3 | 资源（精灵/地图/音效）怎么改 | **第一阶段保留 `read_assets`/`edit_assets` 两个结构化工具**，和 bash 并存 | 已冻结、有测试；做成 p8 子命令没有任何证据 |
| D4 | skill 里的游戏契约 | `p8 check` 不再强制 `g.mode`；契约降为 skill 里的「推荐写法」 | 遵守产品规则；代价是失去 lab 证据，靠 Garden/Lodge 补 |
| D5 | 知识来源 | 启动段用 coding agent 默认提示（M0 验证过的原文，去掉指向 Pi 文档的 docs 段）+ lab SKILL.md + Maker host 段；Maker 参考文档只读挂到 `/skill/pico8/reference/` | 启动前缀保持小（lab 证据的前提），参考按需读 |
| D6 | 图像 | `p8 look --png` + read 读图；image-retention 钩子照常生效 | 和 lab 实测一致；冻结流程的 ×4 直出不搬 |
| D7 | 路线/覆盖统计 | `p8 run --press` 记 normal 路线；第一阶段不提供 debug 写状态 | 覆盖事实可以延续；debug 在 lab 没出现过需求 |
| D8 | 开关 | 会话级 `flow: "frozen" \| "shell"`，默认 frozen；评测矩阵增加 `flow` 维度；UI 入口仅 `?flow=shell` | 默认关闭、可配置开启；工具名不同，转录不能跨流程续接，会话创建时固定 |
| D9 | OPFS | **Maker 不用** | 卡带存储已经持久化；临时文件丢了无所谓 |

## 5. 分阶段计划

| 阶段 | 内容 | 改动范围 | 退出条件 |
| --- | --- | --- | --- |
| **M0 lab 对齐（已完成）** | lab 增加 `--loop durable`：pi-durable Harness + 它自带的 CodingTools + just-bash ExecutionEnv，系统提示用 coding agent 生成的原文 | 只动 `lab/` | 已通过：T1–T5 5/5，T6 3/4，T7 4/4，与 session 循环同档，见下文 |
| **M1 p8 跨线程（已完成）** | `remoteP8` / `p8Host` / Worker 入口；`createEnvironment({ p8 })` | 只动 `lab/` | 已通过：进程内与 worker 线程输出、退出码、文件逐字节一致；durable 循环 + worker p8 跑 T1–T7 7/7 |
| **M2 Maker 接入（已完成）** | p8 核心与 skill 移入 `app/src/pico8/shell/`（lab 经 `maker.mjs` 复用同一份代码）；shell 环境、扩展、p8 Worker、D2 提交、D7 路线、D8 开关 | `app/src/pico8/shell/` 新目录；`agent.js` 按 flow 选扩展（懒加载）；App/评测脚本加 flow 入口 | 已通过：`npm test` 150/150、生产构建；S4 两条流程同时复跑；浏览器烟测通过，见下文 |
| **M3 评测门槛（已执行）** | 第 6 节矩阵，两条流程同模型同输入 | 只动评测脚本与文档 | **未全部达标**：S4 新建独立检查 shell 4/5 < frozen 5/5，见下文 |
| **M4 决策（已定）** | shell 转为新会话默认；冻结流程保留为回退（`?flow=frozen`，旧会话不变） | App 默认、评测默认、AGENTS.md、development-status.md | 2026-11-14 用户决定，依据与残留风险见文末 |

M0 结果（2026-11-14，DeepSeek Flash high）：首个请求逐项核对，系统提示与 coding agent 会话**逐字节相同**；工具定义只差键顺序、工具顺序和两三个词。`read` 能把 `p8 look --png` 的图片作为图像块返回。成绩与 session 循环同档（T6 失败是模型的游戏没过 S4 偏轴路线，不是 harness 问题），归档 `.cache/lab/20261114T0027-5p8a`、`.cache/lab/20261114T0032-ve7i`。结论：**循环不是变量**，换成 pi-durable 不丢效果；第 2 节边界 4 解除。

M1 结果（2026-11-14）：方案从「p8 走测试 Worker 逐帧 RPC」改为「整条命令发给独立 p8 Worker」。顺带修掉 lab 一个不稳定的检查：Lua 表的键顺序在会话间会变，按 `JSON.stringify(g)` 比较会误报按键有响应，现改为排序后比较。durable 循环 + worker p8，T1–T7 7/7（归档 `.cache/lab/20261114T0041-dzcu`）。

M2 结果（2026-11-14）：

- **实现：** `app/src/pico8/shell/`：`environment.js`（just-bash，`/cart/main.lua` 每次操作前后与草稿同步，`/skill/pico8` 只读）、`extension.js`（pi-durable 的 read/write/edit/bash + 改写了 load_game 字样的 `read_assets`/`edit_assets`，启动段为 coding agent 提示去掉 Pi 文档段 + skill + host 规则）、`p8-worker.js`/`p8-client.js`、`flow.js`。`Agent` 新增 `flow`/`startP8` 选项，shell 代码整体懒加载（主包 +1 KB，`flow` 分块 1.3 MB、p8 Worker 255 KB）。冻结流程的代码路径未改。
- **提交：** p8 check/run/look 跑 `main.lua` 后，若草稿有变化，直接调用冻结的 `load_game` 提交，输出末尾加一行 `Maker:`。
- **路线：** 每条 bash 命令只回放最后一次成功的 `p8 run`（走 `reset_game` + `press_buttons`），同一版本同一按键序列不重复记录。第一次 S4 复跑时，修复任务里的扫描循环（`for n in …; p8 run`）把有效路线挤出了 Maker 每卡 12 条的窗口，覆盖统计失败，因此改成这样。
- **音效库：** 只写进新卡带的第一个版本。第一次复跑时修复任务的 `preservedAssets` 失败，原因是把音效库写进了已有卡带。
- **入口：** 会话首次连接时，`?flow=shell` 且会话没有历史，才选 shell 流程，并把 `flow` 存进会话；评测用 `S4_FLOW=shell`、`SMOKE_FLOW=shell`、case-study 页 `?flow=shell`。
- **D4 未做：** skill 的游戏契约原样保留，放宽留到 M3 单独对照。

DeepSeek Flash high，修正后两条流程同时各跑一次 S4：

| 任务 | shell | frozen |
| --- | --- | --- |
| 修复 | 全部检查通过，54.5 s，18 次调用 | 全部检查通过，112.8 s，27 次调用 |
| 新建 | 全部检查通过，66.9 s，22 次调用 | 180 s 时限截断（naturalCompletion 失败），独立玩法检查通过，39 次调用 |

归档：`.cache/evaluations/s4-cb70566a-90f2-4b3d-9a1f-97e5b509210c`（shell）、`s4-69c1c6c2-0dcb-4f8a-9256-a4f168797124`（frozen）；修正前的 shell 复跑 `s4-71db22d0-…`（两项独立玩法通过，修复任务 preservedAssets、agentNormalCoverage 失败）。真实浏览器烟测（接水果，`SMOKE_FLOW=shell`）：12 s、6 次调用，提交版本 1，页面无异常，归档 `.cache/evaluations/evaluation-23a9959c-69e4-4cca-afb8-f2f76d06e2ab`。都是单次样本。

M3 结果（2026-11-14，DeepSeek Flash，S4 thinking high、案例用 Maker 默认配置；两条流程同时运行）：

| 套件 | shell | frozen |
| --- | --- | --- |
| S4 新建 ×5：独立玩法检查 | **4/5** | **5/5** |
| S4 新建：自然完成（未撞 180 s 时限） | 5/5 | 1/5 |
| S4 新建：耗时 / 调用 | 51–138 s（中位 103）/ 13–35 | 140–180 s（4 次截断）/ 9–21 |
| S4 修复 ×5：全部检查 | 5/5 | 5/5 |
| S4 修复：耗时 / 调用 | 48–97 s（中位 54）/ 12–25 | 80–155 s（中位 99）/ 18–26 |
| S4 输入+输出 token 中位（新建 / 修复） | 20.5k / 10.6k | 35.1k / 21.1k |
| Sweet Garden ×2（两轮）：完成、草稿已提交 | 2/2，258 / 481 s，40 / 69 次调用 | 2/2，658 / 804 s，32 / 71 次调用 |
| Lodge Podge ×2（两轮）：完成、草稿已提交 | 2/2，1361 / 753 s，238 / 96 次调用 | 2/2，905 / 915 s，83 / 63 次调用 |

- **S4 新建门槛未达标（4/5 对 5/5）。** shell 那次失败是画面与状态不一致（`player state/pixels disagree`），和 lab 里出现过的像素契约失败同类，是模型写的游戏问题。另有 1 次独立检查通过，但 agent 自己的覆盖统计缺「失败」：12 条路线窗口仍被不同按键的 `p8 run` 填满。n=5 下 4 对 5 不能说明差异，但按门槛就是没过。
- **frozen 新建 4/5 撞 180 s 时限**，独立检查仍然通过（提交的版本可玩），`naturalCompletion` 失败；shell 全部自然结束。
- **案例：** 两条流程 8 次全部完成两轮、草稿已提交。第 6 节要求的「最终版本从正常开局可胜利并重开（独立重放）」**两条流程都没有自动证据**：重放的最长 agent 路线最后一帧都停在游戏中途（Lodge shell 有一次停在标题说明画面）。需要按案例报告的方式人工试玩，本轮没做。shell 在 Garden 上约快一半；Lodge 一次 238 次调用、1361 s，明显离群（read 50、p8 check 41）。shell 第一轮结束时 Garden 的最终版本 normal 路线数为 0（最后一次提交在最后一次 `p8 run` 之后）。
- **归档：** S4 `.cache/evaluations/s4-248c789b-85ca-4691-958b-3cf6f6aa2ed3`、`s4-f1ce671f-bbd0-4ac4-9135-55b893b43333`、`s4-0c204628-2276-4bd8-b628-d0fa59ec8793`、`s4-16c31b32-5b6a-4941-a026-02e85b623817`、`s4-f1e2903c-2bba-4764-8676-0cce658dfad1`、`s4-dfc45b6c-c08f-4b1c-806c-cf80cab6bce9`、`s4-664455e1-531b-475c-8406-b3e4a9d598da`、`s4-561a4f09-6af4-452d-a35d-d7db1619a058`、`s4-e053a5fa-d0d2-4334-9331-8ac85fc4ef5b`、`s4-c8f7d721-b826-4d8c-9ec0-8c463a544ce5`；案例 `.cache/evaluations/case-sweet-garden-83a72047-cb7a-4f5a-bb89-569686a8bbba`、`case-sweet-garden-22652432-ddb3-4f90-8ab8-218f1fee1040`、`case-sweet-garden-shell-d700b6ba-bf13-424a-a6c3-0d99987ae416`、`case-sweet-garden-shell-92c8e109-1a0a-45c8-9954-1c56a7f68a0b`、`case-lodge-podge-6c1314ba-84a7-4fbe-9c49-ba3546582526`、`case-lodge-podge-c8d821bb-fdaa-44fb-9c95-d2a546813fbb`、`case-lodge-podge-shell-3f49a047-070a-4b93-80ef-7eb0ac54dcfd`、`case-lodge-podge-shell-5c09364e-a1d0-4e19-a185-8c43af27f10f`。

M4 建议：**保持开关、不转默认**。先修两处 shell 侧差距，再复跑 S4 新建 ×5：(1) 路线窗口：只回放改变了 `g.mode` 的 `p8 run`，或把 shell 测试结果直接计入覆盖，而不是挤占 12 条窗口；(2) 交付前证据：最后一次提交之后没有 normal 路线时，在 `Maker:` 行提示。案例的胜利/重开需要人工试玩或补一个通用重放检查。

M3 跟进（2026-11-14）：

- **路线回放（b3bfe2f）：** 第一条路线之后，只回放让 `g.mode` 变化（进入结果或重开）的 `p8 run`；提交行带上 `load_game` 自己的覆盖事实（如 `Revision 3: no normal-input route recorded yet.`）和「只有这个版本上的 p8 run 路线算测试过」。复跑 S4 新建 ×5：独立检查 4/5，每次记录 5–9 条路线（不再填满 12 条），agent 覆盖统计 3/5 全过；失败的一次仍是像素契约（受伤闪烁）。
- **skill 加「保持明确要求」规则（试验后回退）：** 在 SKILL.md 第 1、4 步加「记下题面的精确要求并在每个状态保持，不加闪烁等效果；交付前用 p8 run/look 逐条检查」。复跑 shell S4 新建/修复各 ×5：新建独立检查 4/5（这次没有闪烁失败，失败是无敌时长语义），1 次撞时限，中位耗时 103→121 s；修复 5/5，中位 54→77 s；lab T1–T7 7/7，但 T1 从约 4 s 变成 20 s。没有测到通过率提升、却更慢，已回退。
- **合计（同一代码路径下 shell 新建三轮）：** 独立检查 12/15；frozen 本轮 5/5（4 次撞时限）。修复 shell 15/15，frozen 5/5。shell 新建的失败都是模型写的游戏不满足题面细节（闪烁 2 次、无敌时长 1 次），不是工具或提交问题。
- **归档：** 路线修正后 `.cache/evaluations/s4-f48af013-9495-4a78-8543-cafc826b7c36`、`s4-221f1c4f-6b09-4330-8141-08f843458e67`、`s4-756ef381-9758-48b3-a658-fc39bb74f196`、`s4-1b4f270d-858d-49f3-9335-3fefc673d760`、`s4-b6444e62-1e55-4cc3-9280-c02f5653519f`；skill 规则试验 `.cache/evaluations/s4-6ba64139-05f5-47c6-af8e-368f3196b9bc`、`s4-53415d7d-8ab9-4f7c-9c22-9b8a2d35eab1`、`s4-fde610f4-667e-4a7c-a8da-3522dda28af8`、`s4-ad2817c6-28c1-4001-a808-ae451d54a65e`、`s4-11c3b378-d6e4-4a8a-abf7-42a687eef8ec`、`.cache/lab/20261114T0229-7kdc`。

当前判断：shell 流程在效率上明显占优（新建、修复耗时与 token 约为一半，且都能自然结束），在 S4 质量上与 frozen 持平或略低（12/15 对 5/5，样本不足以区分），案例的可玩性两边都未验证。仍建议保持开关。下一步如需继续，优先人工试玩 8 个案例的最终版本，比较两边的游戏质量。

## 6. 评测门槛（M3）

同模型 `deepseek-flash`、thinking high，冻结输入，失败保留，归档到 `.cache/evaluations/`：

| 套件 | 次数/流程 | shell 转为默认的条件 |
| --- | --- | --- |
| S4 新建 | 5 | 独立检查通过数 ≥ frozen |
| S4 修复 | 5 | 通过数 ≥ frozen |
| Sweet Garden、Lodge Podge 复跑 | 各 2 | 最终版本从正常开局可胜利并重开（独立重放）；用到资源工具 |
| 真实浏览器烟测（接水果） | 1 | 正常胜利、失败、重开，页面无异常 |
| 回归 | — | `npm test`、`npm run test:s4` 全绿；转录保存/恢复、STOP、撤销、对比预览正常 |

同时报告中位耗时、工具调用数、token/费用。耗时只作参考，不作门槛：lab 的速度优势可能来自更小的首版，而首版大小本来就是冻结期待验证的问题。

## 7. 风险

| 风险 | 缓解 |
| --- | --- |
| 放宽游戏契约后质量下滑（D4） | Garden/Lodge 在门槛里；放宽前后在 lab 各跑一轮 S4 对比 |
| bash 通用性带来的越界（死循环、超大输出） | just-bash 的执行限制 + pi-durable 输出窗口；p8 帧数沿用 `capabilities.maxInputFrames` |
| 版本数膨胀（每次 check 都可能提交） | 按源码 hash 去重；撤销窗口仍是 12 |
| 两条流程长期并存的维护成本 | M4 必须二选一：要么转默认、移除旧流程（另行评审），要么放弃并删除 shell 代码 |
| 包体积 | just-bash 懒加载，不进首屏 |

## 8. 不在本方案范围

本地模型、纯文本模式、音频观察、debug 写状态的 p8 子命令、资源编辑改成 p8 子命令。这些都等 M4 之后按证据排期。

## M4 决定（2026-11-14）

用户决定以 shell 流程替代冻结流程推进：它直接沿用 Pi coding agent 的形态（通用工具 + 命令 + skill），和 lab 共用同一份代码，后续改进可以先在 lab 快速验证再进 Maker。

依据（DeepSeek Flash，均为小样本）：S4 修复 shell 15/15、frozen 5/5，shell 中位耗时约一半；S4 新建 shell 12/15、frozen 5/5，但 frozen 4/5 撞 180 s 时限，shell 全部自然结束；token 约为一半；两个案例 8 次全部完成。

做法：

- 新会话默认 shell；有历史、没有存储 flow 的旧会话按冻结流程打开（转录里是冻结工具），`?flow=frozen` 让新会话用冻结流程。冻结流程代码不删，删除需另行决定。
- 评测脚本默认 shell，`S4_FLOW=frozen` / `SMOKE_FLOW=frozen` / `--flow frozen` 跑冻结流程做对照。

残留风险：

1. S4 新建通过率可能略低于冻结流程，失败集中在题面细节；试过的通用 skill 规则没有改善，已回退。
2. 案例的可玩性两边都未人工验证。
3. shell 缺 debug 写状态、ASCII 裁剪观察、`/cart/playtests.json`，以及 frozen 启动段里的设计/调色板/交付格式指导（AGENT/MACHINE/WORKFLOW 没有进 shell 启动段）。交付回复不再强制 Gameplay/Controls/Verified/Unverified 四段格式。
4. 版本变多：shell 没有 debug 写状态，模型会临时改代码做测试（例如让水果在篮子处生成），每次 p8 跑通都会提交，撤销历史（12 个版本）里会混入这些临时版本。

主界面端到端（`app-smoke.mjs`，主页输入 → MAKE → 工作台，默认 shell，2026-11-14）：两次各 40–51 s、18 步，提交到 v4，「READY TO PLAY」，Playtest frames 时间线显示回放路线的画面，控制台无错误或警告。第一次的步骤汇总显示「Finished with errors · 1 failed」，原因是 bash 非零退出（如 `p8 check` 有 FAIL）被当成工具失败；已改为只把超时/中止等真正失败计入，非零退出算普通步骤。归档 `.cache/evaluations/app-smoke-*`。
