# Shell 流程路线图

更新：2026-11-14。决定：Maker 只保留 shell 流程（pi-durable 的 read/write/edit/bash + `p8` 命令 + pico8 skill），冻结流程删除，不做旧会话兼容。迁移过程与评测证据见 [shell-flow-migration.md](shell-flow-migration.md)。

## 1. 现状

| 部分 | 现状 | 来源 |
| --- | --- | --- |
| 循环 | pi-durable Harness；重试、压缩、转录、STOP 不变 | `app/src/agent.js` |
| 工具 | read / write / edit / bash（pi-durable 自带）+ `read_assets` / `edit_assets` | `app/src/pico8/shell/extension.js` |
| 环境 | just-bash；`/cart/main.lua` 与草稿双向同步；`/skill/pico8` 只读；其他文件只在会话内存 | `shell/environment.js` |
| `p8` | check / run / look / new / export，在独立 Worker 跑播放器 | `shell/p8.js`、`p8-worker.js` |
| 提交 | p8 跑通 `main.lua` 且草稿有变化 → 内部走 `load_game` 提交 | `shell/environment.js` |
| 路线 | 每版本第一条 + 改变 `g.mode` 的 `p8 run` 经 `reset_game` / `press_buttons` 回放记录 | 同上 |
| 启动段 | coding agent 提示 + SKILL.md + host 规则（约 6 KB） | `shell/prompt.js`、`shell/skill/` |
| 证据 | S4 修复 15/15、新建 12/15；案例 8/8 完成；主界面烟测通过 | 迁移文档 M3、M4 |

已知问题（按影响排序）：

1. **游戏契约太硬：** `p8 check` 的 boot 要求全局 `g` 和字符串 `g.mode`（`shell/checks.js:134-135`），而 skill 第 4 步要求「通过才能结束」。没有胜负的玩具或沙盒游戏会被逼着加 `g.mode`，和产品规则「宽松/表达型游戏不强加胜负」冲突。
2. **版本里混入临时修改：** 没有不改源码就设置状态的手段，模型会临时改代码来测试，每次 p8 跑通都提交，撤销历史（12 个版本）里混进临时版本。
3. **题面细节保真：** S4 新建 3 次失败都是没满足题面细节（受伤闪烁 2 次、无敌时长 1 次）；加一条通用 skill 规则没有效果，已回退。
4. **知识缩水：** 冻结流程的 AGENT/MACHINE/WORKFLOW 和 13 篇参考（game-design、playtest、audio、sprites-maps、asset-authoring、lua、runtime-compatibility…）都没有进 skill；skill 只有 api.md、一个模板和一个示例。
5. **精确像素观察：** `p8 look` 只有 32×32 字符画和 512 PNG，没有冻结流程那种按原生坐标裁剪、带实际调色板的 ASCII。
6. **交付回复：** 不再要求「玩法 / 操作 / 已验证 / 未验证」四段，回复里未验证的部分容易被省掉。
7. **资源不是文件：** 精灵、地图、音效靠两个结构化工具，不符合 Pi 的「一切皆文件 + 命令」形态。
8. **加载：** shell 分块 1.3 MB，现在每个会话都会加载，但只在第一次打开工作台时按需拉取。

## 2. P0：删除冻结流程（已完成）

目标：代码里只剩一条流程，`load_game` 等名字不再出现在模型可见的地方。

| 删除 / 改造 | 文件 |
| --- | --- |
| 冻结扩展、7 个游戏工具和 read/edit 包装 | `src/pico8/extension.js`、`tools.js`、`source-read.js`、`knowledge-env.js` |
| 单文件工作区（只给冻结工具用） | `src/pico8/workspace.js`（`Game` 改为直接持有草稿） |
| 知识包运行时与发布：启动段、版本哈希、回执校验 | `src/pico8/knowledge-files.js`、`scripts/prepare-knowledge.mjs`、`public/extensions/pico8/`、`src/generated/pico8-files.js` |
| 知识包源文件 | `docs/pico8-agent/`：有用的参考先改写进 `shell/skill/reference/`（见 P2），其余删除 |
| `Game` 的 observe/inspect 动作；load/reset/press 改成内部方法（`commit()`、`replayRoute()`），不再按工具名分派 | `src/game.js`、`shell/environment.js` |
| `Agent` 的 flow 选项、App 的 `?flow=`、会话 `flow` 字段 | `src/agent.js`、`src/App.jsx` |
| 冻结工具的 UI 标签和特殊展示 | `workbench-state.js`、`WorkbenchMessages.jsx`、`i18n.js` |
| 只服务冻结流程的评测 | `workflow-cases.mjs`、`workflow-browser.js`、`mechanics-cases.mjs`、`local-probe.mjs`、`freeze-tooling-baseline.mjs`、`docs/tooling-baseline.json`、`S4_FLOW` / `--flow` 开关 |
| 测试：删掉冻结专属的，保留并改写 Game/提交/路线/资源相关的 | 依赖冻结流程较多的：`tool-capabilities`、`inspection`、`audio-coverage`、`workspace`、`workflow`、`pico8-extension`、`knowledge-files`、`agent-contracts`、`local-hints` |
| 文档 | `app/AGENTS.md`（Agent flows、Knowledge and tools 两节重写）、`development-status.md`、`README*` |

保留：S4 题目和独立 oracle、`run-s4` / `run-case` / `app-smoke` / `browser-smoke`、播放器、卡带存储与版本、路线记录与覆盖统计、图片保留钩子、`read_assets` / `edit_assets`（直到 P2-7）。

旧会话：按用户决定**全部清空**。卡带存储升到 schema 4，v3 卡带加载时保留源码、资源和版本，会话换成一个空会话。

验收：`npm test`、构建、S4 ×5（新建/修复）、`app-smoke` 与删除前同档。

**结果（2026-11-14）：**

- 删除 9 个模块（扩展、工具、工作区、知识包运行时）、`docs/pico8-agent/`（原文在标签 `agent-flow-freeze-2026-11-13`，P2-5 迁回 skill 时从那里取）、5 个冻结专属评测脚本和 9 个测试文件；`Game` 新增 `commit()`、`replayRoute()`、`readAssets()`、`editAssets()`，资源工具移到 `shell/resource-tools.js`；调色板改为静态模块 `src/pico8/palette.js`；S4 与结果指标改为统计 bash/p8 调用（`byP8`、`--read`、`look`）和 `Maker:` 提交行；`tests/mock-model.mjs` 的脚本动作自动转成 shell 调用。`Game.execute` 内部仍按旧动作名分派，模型看不到。
- `npm test` 88/88（删掉冻结专属测试后），`npm run test:s4` 11/11，lab 单测 11/11，生产构建通过。
- S4 ×5（DeepSeek Flash high）：新建独立检查 3/5（失败：1 次像素契约 player state/pixels disagree，1 次正常胜利路线结局为 lose），修复 5/5；中位耗时新建 84 s、修复 71 s，全部自然结束。新建累计 15/20，与删除前同档。agent 覆盖统计 2 次缺项：一次 12 条路线窗口仍被多版本的首条路线占满，见 P1-3。
- 主界面烟测：两次 57 / 73 s，提交、试玩帧、无控制台问题；烟测现在会从 IndexedDB 列出工具调用和失败结果。第二次的调用序列里模型用 `sed` 临时改 `score=9` 测胜利再恢复，正是 P1-2 要解决的临时版本。
- 归档：S4 `.cache/evaluations/s4-34f3b431-89fc-4672-84a4-d6ee525f73ad`、`s4-e21b5f9f-a408-490e-b7ba-28dae993f76f`、`s4-39a35ce5-4551-449f-b4f1-aa7a40af1062`、`s4-e653733c-493a-44f4-911e-a35cbc424b7c`、`s4-801c7623-fb54-4ea8-ad0f-94faebf40b9e`；烟测 `.cache/evaluations/app-smoke-*`。

## 3. P1：最影响体验的三件事

| # | 事项 | 做法 | 验证 |
| --- | --- | --- | --- |
| 1 | 放宽游戏契约 | `g` / `g.mode` 改为可选：有就报告模式变化和胜负，没有就只查启动、画面和输入响应；skill 把胜负规则写成「有胜负的游戏这样写」 | lab T1–T7 不退化；新增一个沙盒/玩具任务（无胜负）能 `ALL PASSED` |
| 2 | 不改源码设置状态 | `p8 run/look --setup "lua"`：加载后、按键前执行（`Runtime.setup` 已有，`checks.json` 用例已在用）；带 setup 的运行不回放、不算 normal 路线 | 主界面烟测里不再出现「临时改代码」的版本；S4 不退化 |
| 3 | 每次请求一个版本 | 同一次用户请求里的多次提交合并成一个版本（后一次替换前一次）；撤销按请求回退 | Game 单测；主界面烟测 v1 → v1（而不是 v4） |

**P1 结果**

- **P1-1 放宽契约（2026-11-14）：** `p8 check` 的 boot 不再要求 `g`/`g.mode`，只报告状态（`g.mode="play"` / `no g.mode (no result tracking)` / `no global g`），仍要求画面多于一种颜色、至少一个按键改变 `g` 或画面。skill 的「Game rules the checker expects」改为「How games are written」：有胜负的游戏用 `g.mode`，玩具/沙盒不加任务没要求的结果；新增 `p8 new toy` 模板。lab 新增 T8（空卡带做画画玩具，隐藏用例含「长时间游玩后 `g.mode` 为 nil」）。DeepSeek Flash durable + worker p8：T1–T8 8/8，T8 23 s、12 次调用；T1–T5 5–24 s，T6 56 s，T7 47 s（归档 `.cache/lab/20261114T0405-t68d`）。

## 4. P2：质量

| # | 事项 | 做法 | 验证 |
| --- | --- | --- | --- |
| 4 | 题面要求写成检查 | skill 工作流：新游戏先把题面的硬性要求写进 `checks.json`（按键、setup、期望值），`p8 check` 一起跑；用户后续要求同样追加 | S4 新建 ×10，对比 12/15 的基线 |
| 5 | 知识回迁 | 冻结知识里有用的部分改写成 `skill/reference/*.md`（设计、试玩、音效、精灵地图、资源格式、Lua 兼容、调色板），SKILL.md 里列索引、按需读；改写时去掉工具名，换成 p8/bash 写法 | lab T1–T7、S4、案例 Garden/Lodge |
| 6 | 精确像素 | `p8 look --crop x,y,w,h`：原生坐标裁剪，逐像素输出调色板编号 | S4 像素契约类失败是否减少 |
| 7 | 交付格式 | host 规则加四段回复（玩法 / 操作 / 已验证 / 未验证），已验证里区分正常输入和 setup | 案例回复人工检查 |
| 8 | 资源即文件 | `/cart/gfx.txt`、`map.txt`、`sfx.txt`、`music.txt`（.p8 文本段格式）与草稿资源同步，用 read/edit 改，p8 提交；之后移除 `read_assets` / `edit_assets` | 案例 Garden/Lodge（资源较多）；新增一个画精灵的 lab 任务 |

## 5. P3：评测与工程

- **评测分层：** lab T1–T7（约 2 分钟，每次改 skill 或 p8 都跑）→ S4 ×5（约 6 分钟，每次改面向模型的行为都跑）→ 案例 ×2 + 人工试玩（大改时跑）→ `app-smoke`（改 UI 或环境时跑）。所有结果记在 `development-status.md`，失败保留。
- **案例的通用重放检查：** 用 agent 记录的最长 normal 路线在新会话重放，读取 `g.mode`（有的话）判断胜负/重开，替代纯看截图。
- **加载：** 工作台空闲时预取 shell 分块和 p8 Worker；裁掉 just-bash 用不到的命令。
- **纯文本模型：** shell 的 `p8 look` 字符画和 `p8 run --read` 不依赖图片，可以正式验证 text+tools 模式（`development-status.md` 里原有的待办）。

## 6. 建议顺序

P0 → P1-1、P1-2、P1-3（改动小、直接影响用户）→ P2-5 知识回迁（P0 删除知识包时一起做最省事，也可以先存档、后改写）→ P2-4、P2-6、P2-7 → P2-8 资源即文件 → P3 穿插进行。每一步遵循：先在 lab 跑通，再进 Maker，按第 5 节的分层评测，前后对比记进文档，完成即提交。
