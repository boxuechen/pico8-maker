# PICO-8 创作 Agent：知识与 Pi Durable 接入设计

> 实施更新：英文知识包、常驻 sections、read_reference 与历史恢复验证已接入。原设计中的“未实现”描述为设计时状态；当前入口见 app/src/pico8/extension.js。observe_game 已支持可裁剪 ASCII 与同帧 PNG/ASCII，默认仍为 PNG；当前用法见知识包 guide/playtest。


日期：2026-11-12。状态：设计稿，尚未接入运行代码。

后续细化：[Pi Durable 具体接入方案](pico8-extension-integration.md)。装载方式以该方案的“构建时生成 ESM”以及稳定 ID 的 `read_reference` 为准；本文保留知识架构与早期接口讨论。

## 1. 结论与范围

使用一个固定的 `pico8` extension，组合 **Agent 行为说明、机器定义、参考资料入口、游戏工具**。固定场景不需要引擎选择路由，也不需要一开始就实现通用 skills 安装、发现和管理系统。

创作对象是 PICO-8 游戏。知识体系以 PICO-8 机器和 Lua API 为基础，包含程序、美术、音频、输入、内存与存储。没有 editor 不等于不能创作精灵、地图或音乐：这些数据可以由 Lua 初始化，然后由对应 API 使用。

目前已整理 [创作知识包](pico8-agent/README.md)：AGENT、机器定义、调色板、Lua API 专题与全量目录，以及五个通过真实 runtime 验证的独立示例。没有修改 Agent、播放器、工具 schema 或持久化代码；下文的接入接口仍为拟议方案。

## 2. Pi Durable 实际需要什么

基于项目安装的 `@earendil-works/pi-durable@1.5.2`：

| Pi 概念 | 本项目用途 |
| --- | --- |
| `defineExtension` | 将 PICO-8 的工具与常驻知识组织在一起 |
| `section(key, render)` | 注入稳定的 Agent 说明、机器定义、参考资料目录、宿主能力说明 |
| `defineTool` | 声明参数、描述、执行函数及 replay 策略 |
| `agent.instructions` | 可选的会话专用补充；在 extension sections 之后渲染 |
| 工具 `output` | 模型可见的源码、画面、图例、状态和错误 |
| 工具 `details` / `structuredOutput` | 分别服务 UI / 程序调用方；模型必需信息不能只放这里 |

Pi Durable 是宿主框架，不等于 Pi coding agent。当前应用没有安装读取项目 AGENTS/skills 的加载器；不能通过放置一个特定文件名自动改变网页模型的上下文。官方的 `agents_md` / `skills` 示例也是由宿主提供内容加载逻辑。

建议将 Markdown 在构建时打包成字符串，作为 extension sections 注入；不依赖浏览器访问本机目录。Node 测试显式读取同一批文件并注入，不引入两份提示词。将内容加载与 Pi 注册拆开，可避免 Vite 的 `?raw` 导入破坏现有 Node 测试。

以下仅为接入结构示意，`content` 与工具数组需要后续实现：

```js
const pico8 = defineExtension({
  name: "pico8",
  sections: [
    section("pico8_agent", () => content.agent),
    section("pico8_machine", () => content.machine),
    section("pico8_palette", () => content.palette),
    section("pico8_references", () => content.referenceIndex),
    section("pico8_host", () => content.hostProfile),
  ],
  tools: [...gameTools, readReferenceTool],
});
registry.install(pico8);
```

section 内容保持稳定。不要把帧号、整屏字符、不断增长的源码或当前时间塞进系统提示词；这些放工具结果。Pi 会记录 section 变化，稳定内容更利于缓存和历史一致性。

`app/AGENTS.md` 继续指导仓库开发者；网页模型的 `AGENT.md` 是独立产品文档。单数命名用于区分用途，并非 Pi 的特殊约定。不要把仓库中的 UI、部署、开发命令规则注入游戏模型。

## 3. 推荐的知识结构

最终接入目录建议如下。内容目前存放在 `docs/pico8-agent/`，保持文档阶段，尚未迁入应用或注入模型。

```text
app/agent/
  AGENT.md                  # 常驻：角色、创作流程、验证和交付
  MACHINE.md                # 常驻：机器结构、Lua 关键语义、资源预算
  palette.json              # 单一颜色数据源：编号、字符、中文名、英文名、RGB
  REFERENCE_INDEX.md        # 常驻：参考资料主题和使用时机
  references/
    lua.md                  # P8 Lua、数值、表、字符串、数学
    graphics.md             # 像素/形状/文字/相机/裁剪/调色板
    sprites-maps.md         # 精灵、动画、地图、flags、共享内存
    audio.md                # SFX/music、通道、音符格式、运行时初始化
    memory-storage.md       # RAM/ROM、内存 API、cartdata、存档版本
    playtest.md             # 输入序列、观察协议、玩法验证方法
  recipes/
    sprite-from-rows.lua    # 经真实 runtime 验证的短例子
    map-from-rows.lua
    sfx-from-notes.lua
    music-from-patterns.lua
    save-high-score.lua
```

工作流是固定的，因此 AGENT 与机器定义常驻；较长的 API 细节和可运行例子按需读取。常驻内容以“能开始正确创作”为边界，目标约 2–4K tokens，实测后调整，不预先堆入整个手册。

参考资料统一采用：**用途 → 函数签名与参数 → 返回值/副作用 → 资源或内存关系 → 最小例子 → 常见错误 → 来源与版本**。不能只给模型一串 API 名称。

## 4. 机器定义该包含什么

| 模块 | 常驻知识 | 按需补充 |
| --- | --- | --- |
| 屏幕与颜色 | 128×128；坐标原点和方向；16 个颜色槽；完整文字色表 | `pal` 的绘图/显示映射，`palt`，扩展显示色 |
| Lua 执行 | `_init`、`_update` / `_update60`、`_draw`；16.16 定点数；30/60 逻辑更新 | 数学角度约定、位运算、表/字符串语义、协程 |
| 输入 | `btn` / `btnp` 的按钮编号；与工具位掩码的区别 | 连按、组合键、重复触发、多人输入 |
| 精灵与地图 | 默认 128×128 精灵表、8×8 tile；地图 128×32 加 32 行共享区域；flags | 帧动画布局、`sset`/`mset` 初始化、透明色 |
| 声音 | 64 个 SFX 槽、每槽 32 音符；64 个 music pattern；四通道；先有数据再播放 | 音符编码、速度/循环、音色/效果、music pattern |
| 内存 | RAM 与 cart 数据的区别；按区域安排资源 | `peek/poke`、复制/装载、寄存器及明确的地址表 |
| 存储 | `cartdata/dget/dset`；64 个数值槽（256 字节）；存档 ID 与版本 | 重启/重载/刷新测试、宿主 persistence 生命周期 |
| 预算 | 官方卡带的代码/数据/CPU 约束与设计习惯 | 宿主实际限制、测量方法、优化方式 |

官方机器规格与宿主限制分开记录。例如官方代码 token 预算不等于当前 `load_game` 的字符串长度上限；编译通过也不代表已经验证所有官方导出约束。

### 颜色信息

常驻映射见 [PALETTE.md](pico8-agent/PALETTE.md)，结构化来源为 [palette.json](pico8-agent/palette.json)。中文名称是产品使用的语义标签，不假设模型记住官方命名。已经包括 16 个默认颜色槽及扩展显示色，避免在设计稿里再维护另一份表格。

创作使用数字编号，字符网格使用字符。不要让模型把 Lua 中的 `a` 当成颜色常量。屏幕网格记录的是写入屏幕后的颜色槽；显示时再经过 `displayPalette`。因此截图观察的图例必须根据本帧映射生成，不能永远套默认表。扩展显示色也需要同源文字名称。

## 5. 无 editor 的美术、音频和存储创作

### 美术与地图

当前只提交完整 Lua，也可以把素材定义为 Lua 字符串/表，在 `_init()` 使用 `sset`、`mset`、`fset` 或内存 API 初始化，之后用 `spr`、`sspr`、`map` 绘制。形状绘图同样可用。没有素材编辑 UI 不应变成“只能用 rectfill/circfill”的提示词限制。

参考例子应明确：像素行如何编码、透明色如何处理、精灵坐标与编号的关系、动画帧排列、地图与精灵共享区域的冲突。固定资源初始化一次，不每帧重建。资源数据由源码携带，重新加载和导出后仍可在初始化时重建。

后续如支持完整 cart 资产段，可以改为直接序列化资源；机器知识与游戏 API 不变，仅提交载体不同。本轮不设计素材编辑器。

### 音效与音乐

不能只写 `sfx(0)` 然后假设槽 0 已有声音。Lua 必须初始化音效数据；音乐还需要 pattern 与通道安排。准备经过 runtime 验证的“音符表 → SFX 数据”和“通道表 → music pattern”辅助例子，让模型按可读的音高、音色、音量、效果、速度和循环信息创作。

基础 RAM 中 SFX 从 `0x3200` 开始，每槽 68 字节；music pattern 从 `0x3100` 开始，每个 pattern 4 字节。这些布局和位域应来自本地 runtime/测试及官方资料，写入参考文档并用样例验证，而不是要求模型凭记忆拼字节。高级音色与效果另放参考章节。

“能生成并播放音频”与“模型听过音频”是两件事。当前 manual session 没有向模型返回声音。它可以检查源码、运行错误和可见反馈，不能宣称听感验收完成。未来音频捕获是观察工具扩展，不是 PICO-8 新 API。

### 存档

把 `cartdata` ID、`dget/dset` 槽位表、初始化标志、存档版本作为游戏设计的一部分，避免每次修改随机更换 ID 或清空旧存档。

区分三种存储：游戏里的 cartdata、应用保存的 Lua 版本、Pi 的对话/任务记录。它们互不替代。当前独立测试 session 默认使用内存 persistence；验证同实例重启不等于验证刷新后的持久存档。正式接入时将测试/试玩各自的 persistence 配置作为宿主能力事实提供给模型。

## 6. API 参考怎样交给模型

官方手册作为语义来源，本地 runtime 作为实现与验证来源。重点整理 Lua primer、程序结构、API 与相关机器内存定义；不整理 editor、SPLORE、安装、快捷键、桌面文件管理等操作说明。

不能仅把官方手册 URL 放进提示词：网页 Agent 当前没有浏览器/网页读取工具。建议增加一个范围明确的只读工具，例如：

```text
read_reference({ topic: "audio" })
read_reference({ topic: "graphics", symbol: "pal" })
read_reference({ topic: "recipes", symbol: "sprite-from-rows" })
```

这些是未来接口，不是当前可调用能力。参考目录常驻，内容以 topic / symbol 分块，返回版本、来源、正文、可继续读取的小节标识。未知主题返回可用主题，不偷偷请求任意 URL。浏览器构建内置经过整理的资料，无需引入 Node 文件系统。

推荐给每条资料记录 `id`、`version`、来源 URL/本地文件、核对日期、相关 API、例子验证状态。代码片段必须在当前 release 验证后才能标为“已验证”；参考手册里有这个 API 并不等于我们的例子已经跑过。

先覆盖所有 API 类别的目录与基础用法，再逐步补齐专题。不要一开始把机器人为裁成一个绘图函数白名单，也不要把官方整本手册常驻塞入上下文。

## 7. 观察与工具协议

保留现有五个游戏工具的职责。模型必须知道源代码修改、按键推进和观察分别改变什么状态。

| 工具 | 文档必须说明的语义 |
| --- | --- |
| `read_game` | 当前项目完整源码；不是实时变量快照 |
| `load_game` | 完整 Lua；候选代码先初始化并运行一帧，通过后提交；不等于玩法通过 |
| `reset_game` | 从当前源码重新初始化测试；不表示清空持久存档 |
| `press_buttons` | 1–120 逻辑帧，固定按钮快照；0 表示不按键；耗时以逻辑帧为准 |
| `observe_game` | 最近完成帧和 diagnostics，不推进逻辑时间；无帧时明确返回无帧 |

Lua 的 `btn(1)` 表示右键，而工具中右键是 `buttons: 2`。建议在机器说明和工具 schema 中明确给出按钮编号与位掩码对照，避免混淆。单帧动作、长按和释放各自建立明确测试序列，不靠两次调用之间的墙钟等待推进游戏。

### ASCII 观察的后续方案

播放器已经提供 `packedScreen` 和 `displayPalette`。宿主工具层负责编码即可，不需要为文本格式重写 WASM 或播放器。

拟支持 `format: "ascii" | "png"`，以及可选的整数 `region: { x, y, width, height }`。ASCII 以一字符一像素输出，不偷偷缩放、丢帧或截断。原点在全屏左上角，裁剪必须包含偏移。运行状态、源码 revision、session/generation、帧号、FPS 和 diagnostics 与画面一起返回。

每帧图例使用“字符 → 当前显示颜色中文名 + RGB”，底层数据从同一 palette 表生成。不要只传 RGBA 数组或 RGB 数字让模型自行猜颜色。绘图映射已经体现在屏幕槽值中；显示映射仍需要随帧解析。颜色不代表物体语义。

全屏 128×128 有 16,384 个像素字符，不承诺比图片省 token 或更容易识别。先用真实模型比较全屏、裁剪、PNG 的识别准确率、耗时和 token 消耗，再定默认格式。`press_buttons`、`load_game`、`reset_game` 也返回画面，应使用同一观察编码器。

当前 `project-store` 会移除历史图片，却会保留所有工具文本。加入 ASCII 前必须同时设计历史帧压缩/占位，否则大量字符网格会进入 localStorage 和后续模型上下文。保留可复现的操作及帧身份，需要新证据时重新观察；不要恢复旧画面后冒充当前游戏状态。

## 8. 从 Game Studio / Defold 借鉴什么

| 参考 | 借鉴 | 在本项目的落点 |
| --- | --- | --- |
| Game Studio | 先明确玩家动作、核心循环与反馈，再实现并试玩 | AGENT 常驻流程；不需要引擎路由 |
| Game Playtest | 验证实际可见状态、主要操作与界面可读性 | PNG/ASCII 连续帧与输入序列 |
| Defold Game | API 查证；区分构建、启动、行为验证 | 按需参考；编译通过与玩法通过分开报告 |
| Defold Playtest | 测试关联明确实例；操作完成不等于行为正确；取消后不盲目重放 | session/revision/generation/frame；中断恢复规则 |

不移植它们的桌面窗口、构建工具、运行令牌或 engine 选择流程。PICO-8 只有固定机器与固定工具集，保持一个 Agent 循环即可。

## 9. 建议的落地顺序与验收

1. 文档阶段已完成首版：MACHINE、32 色数据、113 条 API 目录、七个专题及五个独立样例；[15 项验证通过](pico8-agent/VALIDATION.md)。仍未接入应用。
2. 将 Markdown 接入 extension sections，增加 `read_reference`，删除旧提示词中“仅绘图函数”和“始终修复跳墙”的通用限制。Node 测试与浏览器从同一份文本装配。
3. 实现统一 ASCII/PNG 观察格式、图例、裁剪和历史处理；不把未上线参数提前写入模型可见 schema。
4. 用真实 runtime 验证素材初始化、SFX/music、存档样例，再用真实模型验证创作和修改任务。记录模型、输入、工具序列与观察证据。

验收覆盖：

- 模型实际请求中包含 AGENT、机器、文字色表和资料目录；未注入仓库开发说明；资料读取无需外网。
- 新游戏不被旧跳墙提示词约束；修改任务保留用户指定的原玩法。
- 从空素材的 Lua 建立 sprite、map、SFX 和 music；导出源码重新加载后仍可初始化。
- 默认色与重映射/扩展色的 ASCII 图例对应实际画面；裁剪原点、左右半字节、无帧状态正确。
- 保存/重启/刷新按各自环境验证，明确哪些行为持久化；测试实例和试玩实例不混用证据。
- 编译成功、操作执行成功、玩法验证成功、音频听感验证分别报告。
- 停止与刷新不自动重放未知结果的按键操作；历史 ASCII 不造成无限上下文增长。

当前仍使用 `MemoryStorage` 加应用自己的历史恢复；选择 Pi Durable 不会自动让 WASM 游戏状态跨刷新恢复。将来若接入 durable storage，按键、重置与加载的 replay 策略仍需要单独设计，不能仅因 API 名字像“读”就声明 safe；当前 observe 路径也可能懒初始化 Worker。

## 10. 参考与证据

- [PICO-8 官方手册](https://www.lexaloffle.com/dl/docs/pico-8_manual.html)：本次读取标题为 v0.2.7；用于 Lua 与机器/API 语义，不整本复制进提示词。
- [Pi Durable 官方介绍](https://earendil.com/posts/pi-durable/)：解释宿主扩展与指令加载的职责。
- [Pi Durable 官方 README](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md)；具体接入 API 以 [本地 1.5.2 README](../app/node_modules/@earendil-works/pi-durable/README.md) 为准，避免 main 分支漂移。
- [本地 session 契约](../ref/pico8-web-player/docs/standalone-session.md)、[API inventory](../ref/pico8-web-player/spec/pico-api-inventory.yaml)、[机器颜色定义](../ref/pico8-web-player/apps/web-player/src/runtime/pico-frame.ts)。
- [精灵测试](../ref/pico8-web-player/tests/runtime/sprites.test.mjs)、[音频数据与行为测试](../ref/pico8-web-player/tests/runtime/music-audio.test.mjs)、[cartdata 测试](../ref/pico8-web-player/tests/runtime/cartdata.test.mjs)：作为参考阅读；本轮实际执行的是 [知识包样例验证](pico8-agent/recipes/verify.mjs)。
- 本机 Game Studio 0.1.2：[创作组织](</Users/boxue/.codex/plugins/cache/openai-curated-remote/game-studio/0.1.2/skills/game-studio/SKILL.md>)、[试玩流程](</Users/boxue/.codex/plugins/cache/openai-curated-remote/game-studio/0.1.2/skills/game-playtest/SKILL.md>)。
- 本机 Defold Game Studio 0.1.1：[创作流程](</Users/boxue/.codex/plugins/cache/defold-game-studio-local/defold-game-studio/0.1.1/skills/game/SKILL.md>)、[试玩证据](</Users/boxue/.codex/plugins/cache/defold-game-studio-local/defold-game-studio/0.1.1/skills/playtest/SKILL.md>)。以上仅作设计参考，本轮未执行引擎开发或试玩技能。
