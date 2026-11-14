# Shell 流程迁移方案（待评审）

更新：2026-11-14。状态：**方案，未实施**。本文只提议，不授权修改冻结流程；冻结规则见 [development-status.md](development-status.md#agent-流程冻结) 与 `app/AGENTS.md` 的 Agent flow freeze。

## 1. 结论先行

- 把 lab 的 Agent 形态（通用 read/edit/write/bash + `p8` 命令 + skill）以**新增的第二条流程** `shell` 接入 Maker，默认关闭，按开关启用；冻结流程 `frozen` 不改一行。
- **保留 pi-durable**（重试、压缩、转录恢复、STOP、顺序工具都由它负责），只换工具面和启动知识。不迁移到 lab 浏览器版用的 pi-agent-core 裸循环。
- Maker 侧**不引入 OPFS**：`main.lua` 已经由卡带存储（IndexedDB）持久化，再加一份 OPFS 会多出一个真相源。草稿文件之外的临时文件放会话内存。
- `p8` 跑在现有测试 Worker 上（复用 `game.rpc`），不在主线程起播放器。
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

`p8` 的命令解析和输出文案沿用 `lab/local-agent/src/p8.mjs`，底层换掉：

| 子命令 | Maker 实现 | 对 UI 的影响 |
| --- | --- | --- |
| `p8 check` | lint + 在测试 Worker 加载草稿 + 冒烟输入 + `checks.json`（若存在） | 启动成功且源码有变化 → 提交新版本（同 `load_game` 的语义） |
| `p8 run --press … --read …` | 测试 Worker `advance` / `inspect read` | 先按需提交；记录为 normal 路线 |
| `p8 look [--png f]` | `observe`；PNG 写入会话内存 | 不提交 |
| `p8 new <template>` | 写入草稿；模板自带的音效写进草稿资源，而不是每次加载时注入 | 草稿变化 |
| `p8 export` | 走现有导出 | 无 |

需要先抽一层：`runtime.mjs` 的 `Runtime` 改为依赖一个「会话端口」（load/advance/read/observe），lab 用直接会话实现，Maker 用 `game.rpc` 实现。`p8.mjs`、`checks.mjs`、`lint.mjs` 本身平台无关，可以原样复用。

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
| **M1 端口抽象** | `Runtime` 依赖会话端口；lab 用直接实现，测试不变 | 只动 `lab/` | lab 单测 10/10，eval T1 回归通过 |
| **M2 Maker 接入** | `createShellExtension`、ShellEnv、p8 走 `game.rpc`、D2 提交、D7 路线、D8 开关 | `app/src/pico8/` 新文件；`agent.js` 只加按 flow 选扩展 | `npm test` 全绿；冻结流程的 S4 复跑结果不变；shell 流程手动烟测通过 |
| **M3 评测门槛** | 第 6 节矩阵，两条流程同模型同输入 | 只动评测脚本与文档 | 见第 6 节 |
| **M4 决策** | 记入 development-status.md：转为默认 / 保持开关 / 放弃 | 文档；转默认需另起评审 | — |

M0 结果（2026-11-14，DeepSeek Flash high）：首个请求逐项核对，系统提示与 coding agent 会话**逐字节相同**；工具定义只差键顺序、工具顺序和两三个词。`read` 能把 `p8 look --png` 的图片作为图像块返回。成绩与 session 循环同档（T6 失败是模型的游戏没过 S4 偏轴路线，不是 harness 问题），归档 `.cache/lab/20261114T0027-5p8a`、`.cache/lab/20261114T0032-ve7i`。结论：**循环不是变量**，换成 pi-durable 不丢效果；第 2 节边界 4 解除。下一步是 M1。

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
