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

## 3. P1：最影响体验的三件事（已完成）

| # | 事项 | 做法 | 验证 |
| --- | --- | --- | --- |
| 1 | 放宽游戏契约 | `g` / `g.mode` 改为可选：有就报告模式变化和胜负，没有就只查启动、画面和输入响应；skill 把胜负规则写成「有胜负的游戏这样写」 | lab T1–T7 不退化；新增一个沙盒/玩具任务（无胜负）能 `ALL PASSED` |
| 2 | 不改源码设置状态 | `p8 run/look --setup "lua"`：加载后、按键前执行（`Runtime.setup` 已有，`checks.json` 用例已在用）；带 setup 的运行不回放、不算 normal 路线 | 主界面烟测里不再出现「临时改代码」的版本；S4 不退化 |
| 3 | 每次请求一个版本 | 同一次用户请求里的多次提交合并成一个版本（后一次替换前一次）；撤销按请求回退 | Game 单测；主界面烟测 v1 → v1（而不是 v4） |

**P1 结果**

- **P1-1 放宽契约（2026-11-14）：** `p8 check` 的 boot 不再要求 `g`/`g.mode`，只报告状态（`g.mode="play"` / `no g.mode (no result tracking)` / `no global g`），仍要求画面多于一种颜色、至少一个按键改变 `g` 或画面。skill 的「Game rules the checker expects」改为「How games are written」：有胜负的游戏用 `g.mode`，玩具/沙盒不加任务没要求的结果；新增 `p8 new toy` 模板。lab 新增 T8（空卡带做画画玩具，隐藏用例含「长时间游玩后 `g.mode` 为 nil」）。DeepSeek Flash durable + worker p8：T1–T8 8/8，T8 23 s、12 次调用；T1–T5 5–24 s，T6 56 s，T7 47 s（归档 `.cache/lab/20261114T0405-t68d`）。

- **P1-2 `p8 run/look --setup`（2026-11-14）：** 加载后、按键前执行 Lua（复用 `Runtime.setup`），输出首行注明「setup ran (main.lua unchanged; this run is not recorded as normal play)」，出错时给示例；Maker 不回放带 setup 的运行。skill 说明用它测胜利、失败、后期关卡，「不要为了测试改 main.lua」；host 规则补一句。lab T1–T8 8/8（归档 `.cache/lab/20261114T0408-7an2`）；主界面烟测两次（41 / 55 s）模型分别用了 6 次和 6 次 `--setup`，不再出现 `sed` 临时改代码，版本数 v2 / v3（此前 v4）。S4 与 P1-3 一起复跑。

- **P1-3 每次请求一个版本（2026-11-14）：** `Game.beginRequest()` 起记录本次请求的版本；同一请求里再次提交时替换该版本（版本号不变），并清掉旧代码上的路线（`Playtests.dropRevision`），提交行写明「It replaces this request's earlier version N; routes on that code were cleared」；下一次请求才新建版本，撤销按请求回退。host 规则说明这一点。单测覆盖替换、路线清空、跨请求新版本和撤销。
- **P1 验收（DeepSeek Flash high）：** S4 ×5：新建独立检查 4/5（失败仍是受伤闪烁的像素契约），修复 5/5；中位耗时新建 62 s、修复 35 s（P0 时 84 / 71 s）。主界面烟测两次：29 / 59 s，**都只产生 v1**（P0 前 v4、P1-2 后 v2/v3），分别用了 3 / 4 次 `--setup`、0 次 `sed` 临时改代码，无控制台问题。新观察：agent 覆盖统计 2 次缺项，模型用 `--setup` 直接置 `g.mode='lose'` 看画面，没有正常玩到失败——这类证据不算 normal 路线，是 `--setup` 带来的取舍，留到 P2-4（交付格式写明已验证/未验证）一起处理。归档 `.cache/evaluations/s4-25a9e703-1ec2-4073-bf1a-46753774dd25`、`s4-627fbfce-f815-4063-965b-f14cf6c0c332`、`s4-4e193b4d-a85c-44a6-9250-2f418682dd09`、`s4-53bdd4af-18f5-487c-a5a3-543e9e499d4b`、`s4-2d9afbd7-96fd-4a8b-8464-6ea1b7ac6b3f`。

## 4. P2：质量（已完成）

| # | 事项 | 做法 | 验证 |
| --- | --- | --- | --- |
| 4 | 题面要求写成检查 | skill 工作流：新游戏先把题面的硬性要求写进 `checks.json`（按键、setup、期望值），`p8 check` 一起跑；用户后续要求同样追加 | S4 新建 ×10，对比 12/15 的基线 |
| 5 | 知识回迁 | 冻结知识里有用的部分改写成 `skill/reference/*.md`（设计、试玩、音效、精灵地图、资源格式、Lua 兼容、调色板），SKILL.md 里列索引、按需读；改写时去掉工具名，换成 p8/bash 写法 | lab T1–T7、S4、案例 Garden/Lodge |
| 6 | 精确像素 | `p8 look --crop x,y,w,h`：原生坐标裁剪，逐像素输出调色板编号 | S4 像素契约类失败是否减少 |
| 7 | 交付格式 | host 规则加四段回复（玩法 / 操作 / 已验证 / 未验证），已验证里区分正常输入和 setup | 案例回复人工检查 |
| 8 | 资源即文件 | `/cart/gfx.txt`、`map.txt`、`sfx.txt`、`music.txt`（.p8 文本段格式）与草稿资源同步，用 read/edit 改，p8 提交；之后移除 `read_assets` / `edit_assets` | 案例 Garden/Lodge（资源较多）；新增一个画精灵的 lab 任务 |

**P2 结果**

- **P2-5 知识回迁（2026-11-14）：** 从标签 `agent-flow-freeze-2026-11-13` 的 `docs/pico8-agent/` 迁入 `skill/reference/`：lua、graphics、palette、sprites-maps、audio、asset-authoring、input-system、memory-storage、game-design、collect-build、match-puzzle、microgames、runtime-compatibility（路径改到 `/skill/pico8/...`，旧工具名改成 p8/bash 写法）；新写 `reference/playtest.md`（按键语法、`--read`、`--setup`、`look`、`checks.json` 格式、该检查什么）和 `reference/workflow.md`（原 WORKFLOW 的创作/修改/资源/可读性配色表 + MACHINE 的机器事实）；3 个示例游戏和 5 个 recipe 进 `examples/`（游戏和模板都过 `p8 check`；两个音频 recipe 没有输入，标为片段）。SKILL.md 末尾改成参考索引表（+1 KB）。顺带补上 `p8 run/look` 输出 printh（最后 20 行），此前 skill 让用 printh 但 p8 不显示。lab T1–T8 8/8，模型在 T6–T8 主动读了 playtest.md/workflow.md；T6 这次 187 s（模型自己写了 awk 模拟器算路线），其余 3–62 s（归档 `.cache/lab/20261114T0656-svwo`）。

- **P2-4 题面要求写成检查（2026-11-14）：** `checks.json` 用例新增像素期望 `{"pixel":["g.player.x","g.player.y"],"equals":11}`（最后一帧该点的调色板颜色，坐标可用数字或状态路径），`reference/playtest.md` 写了格式和「可能闪烁时查相邻两帧」。SKILL.md 工作流加第 2 步。两轮对照（DeepSeek Flash high，S4 新建 ×10、修复 ×5、lab T1–T8）：

  | 版本 | S4 新建独立检查 | 新建中位 | 修复 | 修复中位 | lab |
  | --- | --- | --- | --- | --- | --- |
  | 此前 shell 累计（无此规则） | 19/25 | 62–103 s | 25/25 | 35–71 s | T1–T5 4–24 s |
  | 规则 A：任何带精确规则的任务都先写用例 | 9/10 | 127 s | 5/5 | 89 s | 8/8，T1 18 s、T4 67 s |
  | **规则 B（保留）：仅新游戏，最多 8 条，修改/修复不加用例** | **10/10** | 92 s | 5/5 | 66 s | 8/8，T1 7 s、T4 37 s |

  10 次新建都写了 `checks.json`。规则 A 唯一的失败仍是受伤闪烁的像素契约。agent 正常覆盖统计缺项 B 轮 2 次（模型用用例和 `--setup` 验证失败路径）。代价：新建中位耗时比 P1 的 62 s 多约 30 s。归档：A `.cache/evaluations/s4-c736b81e-c213-49d8-97a1-0a39a991e5c7`、`s4-67f13a6d-7e62-49e6-8c51-3e363e5efa51`、`s4-c12d0e15-794a-4007-b82f-bc98f53ea114`、`s4-522e4c56-3298-493b-baeb-d95c8b383064`、`s4-a80d6223-b5b3-466b-81ec-37941af585ad`、`s4-f152b806-e2b3-4b5f-baf4-4fc3305ea96c`、`s4-da4b4dc5-5fe3-4dd9-9c88-e1ce1bf40329`、`s4-f4154b91-c628-4494-960f-eeb9e4f450c8`、`s4-0ee2c631-e06e-49e4-9c2f-3e9eddc58b8b`、`s4-0e21c0e5-4c88-4349-8100-54c76ac3ae7b`，`.cache/lab/20261114T0702-x5p4`；B `.cache/evaluations/s4-19f14955-8db5-41c1-9cf0-d95a71969e20`、`s4-588a0aad-9a18-4915-bc71-ce728dabf2db`、`s4-8613d9a5-2830-4e3a-9fa8-30f6897426da`、`s4-9daa4d5c-7559-4622-b7d2-023e9a1424e1`、`s4-5c87f458-5dbf-478f-89a5-2306d849b603`、`s4-9eccb8ae-4933-4e24-91f6-3b9168d8892a`、`s4-98294c9b-76f7-4ff8-a654-2c60c6d569fb`、`s4-4605b44f-feb0-441a-a60c-037cfdf40bb3`、`s4-df9b50e3-331d-47c3-90eb-379078855acd`、`s4-06980de2-0d17-49ce-988b-4daf10a49922`，`.cache/lab/20261114T0708-pi3a`。

- **P2-6 `p8 look --crop x,y,w,h`（2026-11-14）：** 按屏幕坐标输出矩形内逐像素颜色（0-f，最多 64x64，越界裁剪，非法参数给示例）；SKILL.md 和 playtest.md 写了用法（例如查无敌帧上玩家是否被画出）。
- **P2-7 交付格式：** host 规则要求做完或测完游戏后用四项回复：Gameplay / Controls / Verified（区分只用按键玩过的路径和用 `--setup`/`checks.json` 检查的）/ Unverified；问题和计划直接回答。SKILL.md 第 6 步改成「简短说明改了什么、查了什么（宿主可能指定格式）」。
- **P2-6/7 验收：** S4 ×5 新建 4/5（失败为敌人状态与像素不一致）、修复 5/5，中位 101 / 76 s；与 P2-4 合计新建 14/15、修复 10/10。lab T1–T8 8/8（T1 5 s）。主界面烟测两次都只到 v1，回复都按四项写，Verified 里分开写了「presses only」和「--setup」的路径，Unverified 写了没盲玩完整胜利、音质等；其中一次模型为了按键玩出完整胜利用了 236 s、57 次调用（另一次 61 s、19 次）。归档 `.cache/evaluations/s4-9b722b97-70f4-4b20-92e9-290d81367f36`、`s4-6a3439df-2446-42d3-b84b-17ee246c487a`、`s4-9fa4fbb4-1661-4a2a-be39-14f31110b95a`、`s4-7b89bc66-21eb-4a97-96db-8921a4bcdf8f`、`s4-5ca9af68-b95b-416a-99a5-ee9f1367dbf6`，`.cache/lab/20261114T0714-w1di`。

- **P2-8 资源即文件（2026-11-14）：** `/cart` 下 `gfx.txt`、`gff.txt`、`map.txt`、`sfx.txt`、`music.txt`，就是 .p8 各段的文本格式（`shell/resource-files.js`：导出、严格校验——行数/长度/十六进制错误带文件和行号、按段覆盖）。Maker 侧与草稿双向同步：每次操作前后同步，只在草稿资源被别处改动（撤销、别的会话）或文件被删时重写，所以模型写坏的文件会留着由 p8 报错，而不是被覆盖；新卡带一开始就把音效库写进 sfx 0-7。p8 每条命令都读这些文件（坏文件直接报错、不运行），新增 `p8 sheet --png`（精灵表 4x 带网格）、`p8 map x,y,w,h --png`、`p8 sfx <id>`（用文字描述音符）。删除 `read_assets`/`edit_assets` 工具、`Game.readAssets/editAssets` 和对应界面标签；`reference/asset-authoring.md` 改写为文件格式说明（精灵坐标、flag 位、地图单元、sfx 头与音符、music 标志），SKILL.md 与 host 规则同步。lab 任务也带资源文件，评分使用最终资源；新增 T9（不改 main.lua，只在 gfx/gff 里画一个金币并设 flag，隐藏用例查像素与 `fget`）。mock 模型的资源动作改成整文件写入。
- **P2-8 验收：** S4 ×5 新建 5/5、修复 5/5（中位 101 / 39 s）；lab T1–T9 9/9（T9 15 s，模型用 sed 改 gfx.txt/gff.txt）；主界面烟测 v1、147 s，模型用 `p8 sfx` 和读 sfx.txt 核对音效；案例各 1 次：Lodge Podge 两轮 382 + 376 s 完成，Sweet Garden 第一轮撞 900 s 时限（80 次调用，已提交 r1）、第二轮 612 s 完成。两个案例都主要用图形函数作画，资源文件操作每轮只有个位数，Garden 变慢不来自资源文件；是否稳定变慢需要更多样本。单测 app 91/91、lab 14/14、`test:s4` 11/11。归档：S4 `.cache/evaluations/s4-1fb9d72d-7da4-4250-a4ac-1f870cd10c07`、`s4-4ea6d57c-f7b1-4b1a-971d-e871deb63e89`、`s4-e482443a-8057-49b6-84fd-9a3b65fd7dfe`、`s4-10f0dd16-466d-483b-bebc-774e2e1bdf49`、`s4-c599b9b7-6eaf-4d11-9a5a-3d1f9ff6bcb0`；lab `.cache/lab/20261114T0728-ng4v`；案例 `.cache/evaluations/case-sweet-garden-5afda7aa-b2f5-46a6-ae2b-e9e459f6dd50`、`case-lodge-podge-2d5a5590-d5d8-44db-80d5-266e8b6123f8`。

## 5. P3：评测与工程（已完成）

- **评测分层：** lab T1–T7（约 2 分钟，每次改 skill 或 p8 都跑）→ S4 ×5（约 6 分钟，每次改面向模型的行为都跑）→ 案例 ×2 + 人工试玩（大改时跑）→ `app-smoke`（改 UI 或环境时跑）。所有结果记在 `development-status.md`，失败保留。
- **案例的通用重放检查：** 用 agent 记录的最长 normal 路线在新会话重放，读取 `g.mode`（有的话）判断胜负/重开，替代纯看截图。
- **加载：** 工作台空闲时预取 shell 分块和 p8 Worker；裁掉 just-bash 用不到的命令。
- **纯文本模型：** shell 的 `p8 look` 字符画和 `p8 run --read` 不依赖图片，可以正式验证 text+tools 模式（`development-status.md` 里原有的待办）。

**P3 结果**

- **P3-1 分层评测（2026-11-14）：** `npm run eval:tier -- --tier quick|agent|full [--model] [--repeat]` 并行跑 lab T1–T9 / + S4 ×N / + 两个案例和主界面烟测，日志与 `summary.md` 在 `.cache/evaluations/tier-*`。`run-case.mjs` 新增 `--model`，`app-smoke.mjs` 读 `SMOKE_MODEL`，便于换模型对照。试跑 quick：9/9，173 s。

- **P3-2 案例通用结果重放（2026-11-14）：** `scripts/evaluation/result-replay.mjs`：把 agent 在最终版本上记录的每条正常按键路线，在新会话里用 p8 同款的固定随机种子运行时重放，逐帧读 `g.mode`，报告正常游玩是否到达胜利、失败和结果后重开；`run-case.mjs` 结束时自动写入 `report.json.resultReplay`，`eval:tier` 汇总里也会显示。复核现有 12 个案例归档：**Lodge Podge 6/6 都由正常路线到达胜利并重开**（含 M3 两条流程各 2 次和 P2-8 的 1 次；此前看最后一帧在游戏中途，是因为路线在重开后继续玩了几步）；**Sweet Garden 只有 2/6 到达胜利**（M3 shell 两次的路线只有 113–160 帧，没有玩到结果），失败路径都没有被正常路线覆盖。

- **P3-3 预取（2026-11-14）：** 页面空闲时（`requestIdleCallback`，最多 5 s）加载 shell 分块（1.4 MB，gzip 410 KB）并预热一个 p8 Worker（含播放器模块和 wasm）；第一个会话直接接管它，随后再预热一个。主界面烟测新增 `firstStepMs`（点击发送到出现第一个工具步骤）和 `SMOKE_IDLE_MS`（发送前等待，模拟用户输入）。本机 dev server 上：不等待 1350 ms，等待 8 s 后 1128 ms——本地加载本来就快，差约 0.2 s；收益主要在慢网络，尚未实测。just-bash 命令裁剪没有做（它的浏览器包是单文件，按命令裁剪需要改打包方式，收益待评估）。

- **P3-4 纯文本模型（2026-11-14）：** 模型目录改为列出所有支持文本的模型（如 `deepseek-v4-pro` 只支持文本，此前被过滤掉）；连接测试对纯文本模型用文字描述颜色，工具调用往返不变。Agent 按所选模型的 `input` 判断：纯文本时 host 规则追加一句（看不到图片，不写也不打开 PNG，用 `p8 look` 字符画、`--crop` 和 `--read` 判断画面，「已验证」里注明画面是按字符画检查的），并且请求里所有工具结果图片换成文字说明（`textOnlyImages`），而不是让 pi-ai 发「(see attached image)」。lab 的 durable 循环同样处理。`eval:tier` 新增 `--s4-time-ms` 和 `--parallel`。
  - **已有证据（deepseek-v4-pro）：** 主界面烟测通过（v1，147 s，17 次调用，没有读过 PNG，回复写明「Visual checks from text pictures」，胜利和失败都用按键玩过）；lab T1–T9 9/9（第一轮，397 s）；S4 修复独立检查 5/5（180 s 时限）。S4 新建在 180 s 时限下 0/5，全部超时——v4-pro 明显慢于 flash。
  - **充值后复跑（600 s 时限，`--parallel 5`）：** lab 8/9（T6 像素不一致）、修复 5/5（中位 235 s）、新建 3/5（中位 436 s，1 次撞 40 次工具上限）。失败都在 oracle 的 `stateAndPixels`：敌弹在敌人中心生成、每 60 帧有一帧盖住敌人中心像素；`inv=21` 的补偿写法让致命一击那帧 inv=21。都是只在个别帧出现的偏差，按键结束时判一次的 checks 抓不到。
  - 直接探测 DeepSeek API：`deepseek-flash` 能识别图片颜色；`deepseek-v4-pro` 不报错，但服务端把图片替换成「[Unsupported Image]」——v4-pro 仍是纯文本，继续走本节的纯文本路径。
  - 自定义端点仍按支持图片处理（设置里没有「仅文本」开关），留作后续。

- **P3-5 每帧不变量（2026-11-14）：** `checks.json` 期望新增 `"always": true`（每个按键帧后都判，报告第一帧违例：`… is 9, expected 8 after 19 pressed frames (wait*30)`）和 `"each": "g.enemies"`（对列表每个元素判，`path`/`pixel` 写元素字段名，如 `"pixel":["x","y"]`）。SKILL.md 第 2 步和 playtest.md 说明用途（画面与状态每帧一致、计时器范围）。lab 单测复现了上面两种单帧故障。
  - **评测：** flash lab 9/9、新建 5/5（中位 91 s，模型自发写了 `each`+`always` 的敌人颜色和 x 范围不变量）、修复独立 5/5（全部检查 3/5：2 次失败路线只用 --setup 验证，修复任务不写 checks，与本改动无关）。v4-pro lab 8/9、修复 5/5（中位 172 s）、新建独立 4/5（此前 3/5，像素类失败消失；剩 1 次是致命一击不设 inv=20 的语义分歧），但 2 次游戏已正确却撞 600 s 时限——v4-pro 首次成功加载在 200–509 s、单次输出 3–6 万 token。
  - **结论：** v4-pro 比 flash 慢约 5 倍、质量不更高，保持 flash 为默认；v4-pro 作为纯文本可选模型可用，评测需 900 s 时限。

- **P3-6 覆盖提示与路线记录（2026-11-14）：** ① `--setup` 运行进入了本版本正常按键尚未到达的 g.mode 时，追加 `Maker: g.mode "lose" reached only with --setup on version N … reach it with presses only … otherwise list it under Unverified`。② 修复路线记录的 bug：原来每条 bash 只回放最后一次 `p8 run`，模型的「失败；失败后重开；wait*90」只剩最后那条无变化的路线，失败路线丢失；现在每条 bash 回放所有进入本版本新 g.mode 的运行（最多 3 条），没有时才回放本版本首条。③ S4 题面写明每次命中（含致命一击）都令 inv=20，之后每帧减 1，减到 0 才能再受伤。
  - **评测（flash）：** 修复全部检查 3/5 →（仅①）4/5 →（①②）5/5；新建独立 5/5 两轮，各 1 次 180 s 超时（游戏已正确）；lab 9/9。

- **P3-7 多轮评测（2026-11-14）：** `eval:tier --tier turns`（`full` 也包含）。`run-turns.mjs` 用与 `run-case.mjs` 共用的 `conversation.mjs` 驱动生产 Agent；用例在 `turn-cases.mjs`：
  - `edits`：从固定的接水果底座（版本 1）连续四次修改（连击、下落加倍、换色、X 暂停），每轮后用隐藏 checks 判本轮与此前所有要求和底座规则（只用底座已有的名字）。
  - `assets`：同一底座，换成精灵（苹果+编织篮）、加背景音乐和区分接住/漏接的音效、加第二关（改变胜利规则），用函数打分：画面颜色、音频事件、资源、规则。
  - `snake` / `meteor` / `paint`：一句话新建 + 一次追加，通用检查 + 路线结局重放 + 每轮截图人工看。
  - 每轮记录产生的版本数（期望 1）。`tests/turn-cases.test.mjs` 校验检查本身：每轮参考实现通过，上一轮的卡带不通过新项（`guard` 项除外，并单测它们能抓到错误改法）。
  - **基线（flash）：** edits 5/5 × 4 轮全过（每轮 5–43 s）；assets 5/5 × 3 轮全过，但第二关一轮 141–423 s（中位 245 s）、精灵一轮最长 239 s；模糊需求 3/3 通过，结局重放正常，截图可读，5 次精灵都认得出。每轮都只产生 1 个版本。
  - **发现：** 正确性已饱和，主要差距在耗时。第二关最慢的一次 90 次调用、67 次 `p8 run`：为了「只用按键打到胜利」，模型用 Lua 写了自动玩的模拟器去搜 685 帧的按键序列，约 5 分钟。→ P3-8 处理。

## 6. 建议顺序

P0 → P1-1、P1-2、P1-3（改动小、直接影响用户）→ P2-5 知识回迁（P0 删除知识包时一起做最省事，也可以先存档、后改写）→ P2-4、P2-6、P2-7 → P2-8 资源即文件 → P3 穿插进行。每一步遵循：先在 lab 跑通，再进 Maker，按第 5 节的分层评测，前后对比记进文档，完成即提交。
