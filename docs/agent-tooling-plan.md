# Agent 工具与创作流程改造计划

状态：S0 / P0 实施中。2026-11-13 根据工具、runtime、知识编译器和评测代码整理。[实施记录](tooling-progress.md)区分已完成内容与待验证接口；下列目标契约未全部实现。

目标：让模型直接获得可解释的游戏状态，用更少的调用完成创作和验证；画面仍用于判断可读性和反馈。先完成 P0 工具与 P1 Workflow，再用小规模结果评测决定后续投入。

## 范围与既有事实

- 保留单文件源码、原生资源、草稿与资源原子提交、试玩与测试隔离、执行前校验、知识包版本/hash、数值范围提示和用户请求前的对比快照。
- 不兼容旧工具参数、旧 skill 路径和旧测试记录格式。删除旧分支及对应测试，更新所有第一方调用点，不引入别名或迁移适配层。已有卡带源码、资源和版本不因此删除；旧格式测试记录不参与新验证，旧对话仅作为历史展示，不重新执行旧调用。
- runtime 是独立仓库 `ref/pico8-web-player`，计划基线依赖提交为 `43d3ef70c07f707b2b6bec0823fa08744df0d7f3`。Maker 的 `ref/` 被忽略，底层修改必须在播放器仓库单独提交，再更新 Maker 的依赖记录与 release。
- 计划基线中 `printh` 在 `wasm/bridge/p8w_frame_runtime.cpp` 转换字符串后丢弃；Maker 的测试 Worker 只支持 init/load/reset/observe/advance，没有 Lua 查询入口。
- 模型 PNG 当前按原尺寸编码；输入同时支持顶层简写、steps、captureFrames 和 replay；启动只载入 skill 目录，正文按需读。
- 用户提供的 296 次调用、164 次观察和 144 次逐行扫描作为问题线索，实施前从固定归档按统一脚本复核，不当作已经重算的基线。两案例已有独立最终卡带路线；后续分别记录「Agent 自主验证」与「独立验证」，不混算。
- 512×512 放大有望改善视觉输入，但不预先认定它一定增加有效图像 token 或减少调用；用同画面小样本对照验证。

## 架构与接口决策

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| C++ / z8lua bridge | 原始全局值读取、有界调试执行、有界日志、VM 栈与执行状态恢复 | 卡带版本、normal/debug 记录、UI、模型提示词 |
| runtime-core / runtime composition | 类型化 VM port、生命周期串行化、调试操作状态、执行限额 | 模型工具参数、图像放大、评测结论 |
| standalone session / transport | 暴露查询、调试、日志读取能力；保持公共类型与消息一致 | 另建一套 VM 或将 WASM 指针暴露给 Maker |
| Maker test Worker / Game | 调用 session、测试轮次身份、debug 标记、取消与恢复、精简工具结果 | 绕过公开接口访问 WASM 或修改实时试玩状态 |
| 知识包 | 创作 Workflow、正确使用工具、关键状态约定 | 复制 API schema、宿主实现说明、自动判断游戏通过 |
| evaluator | 冻结输入、独立执行、结果断言、调用和字节指标 | 根据模型自述或读取 skill 次数判通过 |

执行链保持 `tool → Game → test Worker → standalone session → shared runtime → bridge → VM`。调试能力在创建测试 session 时显式开启；实时播放器默认关闭。不创建 Maker 私有 VM 分支，不给产品 Agent 文件系统、shell 或 runtime 源码写权限。

### 状态工具：`inspect_game`

新增一个工具，保留简单对象 schema；不使用顶层 oneOf/not。宿主按 mode 校验必需字段、互斥字段和上限，校验失败不触发 Worker 操作。

```json
{"mode":"read","paths":[["g","mode"],["g","board"],["g","moves"]]}
```

```json
{"mode":"debug","code":"g.moves=1; return g.moves"}
```

- `read` 只接收路径段数组：首段是全局名，后续为字符串键或整数键；使用 raw 全局/table 访问，不编译表达式，不调用函数或元方法。批量读取棋盘及计数，不改变时间、随机数、输入、RAM 或存档。只能看到全局可达数据，不能读取局部变量或闭包上值；旧卡带无需为了读取而强制改写。
- `debug` 在当前 VM 执行 Lua chunk，可用 `return` 返回表达式结果，也可修改值。**任何 Lua 执行都算 debug**，即便看起来只是 `return f()`。不尝试静态判断表达式是否纯净。
- 值通过有界数据快照返回，支持 nil、布尔、字符串、定点数和嵌套 table。定义明确的 table entry 编码，保留数字/字符串键与稀疏项；nil、循环引用、深度/数量截断、function/userdata/thread 使用类型标签，禁止调用 `__index`、`__pairs`、`__tostring`，禁止输出地址。定点数按真实数值解码。
- 初始固定限额：每次最多 16 条路径、深度 4、合计 512 个 table entry、16 KiB 结果；debug 源码最多 4 KiB、50,000 条 VM 指令。达到限额返回明确截断或预算错误，不返回损坏 JSON。通过关键 fixture 校准后再锁定，不交给模型任意提高。
- 只在已完成帧的安全边界执行；拒绝 pending host request、故障或正在加载的 session。复用 VM 指令预算和内存上限，覆盖嵌套函数、协程与元方法；禁止 debug 触发换卡、run/reset、flip/yield、外部 I/O 和持久化写入，约束落实在执行/host 入口，不能只隐藏全局函数名。
- debug 不推进帧、不隐式调用 `_update`/`_draw`。返回 `stateSeq` 与最后完成的 `frameId`；后者是修改前画面。用下一次 `press_buttons` 获得新画面，不能把旧 PNG 当修改后证据。
- debug 开始执行前记录本轮 debug 标记；执行失败、超预算、取消也不撤销。语法检查失败且未进入执行可保持原标签；任何可能已执行的失败都要求 reset 后继续。部分赋值不会自动回滚。
- Worker 被终止、换卡或恢复会话时旧证据失效。结果保留足够的 run/版本身份，拒绝迟到响应。

### 测试轮次与存档

- `reset_game` 只支持 `purpose: "normal" | "debug"`，省略默认 normal。load 成功也从新卡带起点建立 normal 轮次；normal 描述起点和无调试操作，不等于胜利判定。
- 每次 load/reset 创建全新的测试 session 与内存存档，从已提交卡带载入并推进首帧。这样 debug 改过的 RAM、全局状态、资源、随机数和存档不会污染下一轮 normal。实时试玩存档不变；同一测试轮次仍可测试 cartdata 读写。
- 本轮一旦 debug 即保持 debug；只有新 load/reset 能开启新 normal 轮次。记录首次调试的状态序号、有限长度代码、结果状态和中断原因；调试不更新源码、卡带版本、导出内容或用户对比快照。
- 保留有界输入和证据记录，移除产品工具的 replay 路由、链状态和旧格式读取分支。新格式显式带版本；旧记录不做转换，不作为当前正常路线证据。独立 evaluator 可以直接重放规范化 steps，无须暴露模型 replay 参数。

### 日志、图像和文本结果

- `printh` 输出进入每个 session 独立的有界缓冲，保留 frame/序号，不写文件、不接浏览器 console。初始上限 64 条/8 KiB，单条最多 1 KiB；溢出给 dropped 数。`printh` 的文件名参数不赋予文件访问能力。
- session 按日志序号非破坏性读取，Maker 记录本轮已交付 cursor，成功交付后前移；重复 observe 不重复发送。load/reset 清 cursor，批量输入收集整个批次日志，不能只保留最终子步。日志和 runtime fault 分字段，限制日志不能遮掉故障。
- 发给模型的运行截图统一最近邻 ×4：整图 512×512，裁剪图 width×4、height×4。坐标、ASCII、frame hash、标签和 UI 时间轴仍基于原生 128×128。资源 PNG 也走同一模型图像出口，预览显示不变。
- 裁剪使用请求矩形与屏幕交集，返回实际 region。负坐标或右/下溢出可裁剪；非整数、非正尺寸或完全无交集返回明确错误，不伪造 1×1 图片，也不自动推进游戏。
- 建立专用模型结果 DTO，不直接展开 runtime observation。常规字段为 committedRevision、run、purpose、frameId、stateSeq、运行状态，以及非空 diagnostics/logs；保留 draftDirty，详细源码预算和数值建议仅在源码 `read`、`load_game` 返回。
- sessionId/generation 等保留在内部取消与身份检查中，不进入重复模型文本。成功输入保留 requestedFrames/completedFrames/outcome；仅部分完成或中断输出 execution.steps。多截图调用只带一次公共头，每张图附 checkpoint；正常结果不重复兼容性说明。
- `inspect_game` 默认仅返回状态文本，不额外附 PNG。正常无日志的单帧结果头目标不超过 500 UTF-8 bytes，较固定旧样本至少减少 50%；错误、日志、源码预算、ASCII 和状态数据分开统计。

### 唯一输入形式

```json
{"steps":[{"frames":1,"buttons":16,"tap":true,"capture":true},{"frames":20,"buttons":0}]}
```

只保留 steps，单步 frames/buttons 必填，tap/capture 可选。保持 8 步、600 帧、8 张截图上限；tap 前后释放帧计入预算，最终帧总是返回，capture 与最终帧重合时去重。旧顶层 frames/buttons、captureFrames、replay 一律拒绝，整批校验通过才开始执行。

## 实施顺序与验收

### S0：冻结基线与接口（先做）

1. 保存当前 Maker commit、runtime commit、知识 hash、模型配置和两案例最终卡带 hash；从归档复算工具次数、错误率、图像数量和结果文本 bytes。不重跑历史模型批次。
2. 明确上面的状态、日志、输入、结果 DTO 和记录格式，给各自类型与上限一个权威定义。确认 debug 对 callback/custom-loop 两类 runtime 的安全边界。
3. 在 evaluator 中先加入新指标采集，旧 skill 过程检查标为历史，不充当改造后基线结论。

交付：固定基线摘要、结果样例、测试 fixture 列表。验收：使用同一归档可重复得到相同指标；正常路线和人工/独立验证分栏。

### S1：先降低每次调用负担（P0：建议 2–5）

改动范围：`app/src/pico8/input-sequence.js`、`observation.js`、`playtests.js`、`tools.js`、`game.js`，以及相关 fixture、evaluator 和示例调用点。

1. 删除旧输入入口和 replay 分支，更新内部记录格式及第一方调用者。冻结历史案例原始文件；需要新契约样本时生成新的版本化 fixture，不添加运行时旧格式适配。
2. 实现裁剪交集、模型 PNG ×4 和统一图像出口；注意测试 helper 重写了 `Game.image`，必须让生产和测试都经过相同放大逻辑，避免只验证 stub。
3. 引入精简结果 DTO；预算只随源码 read/load 返回；保留故障、部分执行进度和证据身份。
4. 移除 unspecified，采用新轮次/内存存档策略；暂未接入 debug 工具时，仍能用显式 debug purpose 标记人为修改卡带的试验。

关键验收：真实 WASM 的 held/tap 输入保持原时序；参数非法时零执行；提前 stop 的完成帧数准确；PNG 512×512 且每个 4×4 块等于原像素；裁剪边缘/无交集行为明确；原生 frame hash 与实时预览不变；恢复旧卡带不会丢源码资源。

### S2：runtime 日志与状态能力（P0：建议 1）

先阅读播放器 `docs/README.md`、`docs/architecture.md` 与 ABI 规范。改动归属：`wasm/bridge`、`packages/z8lua-bridge`、`packages/runtime-core` 的 VM port、`apps/web-player/src/runtime`、transport/public exports、`spec/abi` 和 standalone session 文档。

1. 先打通 `printh → session → test Worker → tool result`，加日志缓冲、cursor 与截断。这是可独立交付的小切片，但不代替状态读取。
2. 实现 raw 路径查询和有界序列化；批量读取 board/moves/score 不运行 Lua。
3. 实现受限 debug chunk、预算恢复和生命周期保护；在 Maker 接入 `inspect_game`，调试前标记本轮、调试后更新 stateSeq，失败要求 reset。
4. 完成 fresh-session reset、取消和迟到响应隔离；记录格式支持 debug 事件。
5. 更新 ABI/公开 API 的版本、声明与构建锁；按规范从实际源码重建产物、更新来源/hash，不能仅改 manifest 绕过校验。在播放器仓库提交，再将新 release 接入 Maker。

关键验收（必须跑真实 WASM）：

- 读取完整棋盘后帧数/时间/随机序列不变；带副作用元方法的 table 读取不调用元方法；循环/深层/稀疏数据有界且保持类型。
- debug 改 moves 后可在下一帧触发胜利，源码/导出 hash 不变、实时试玩状态不变；整轮自动 debug。
- 调试执行到一半报错、死循环、嵌套协程和日志洪泛均受限；禁用的生命周期/I/O 操作确实在底层被拒绝；超限后 reset 可以恢复。
- 新 reset 清掉调试状态和内存存档；frameId 可重用但 run 身份不同，旧状态/日志/Worker 响应不能混入新轮次。
- 不使用调试能力的普通卡带输入路线帧 hash 与改造前一致；日志不会重复交付、跨批次丢失或改变 `printh` 原有返回语义。

### S3：统一 Workflow 与文档（P1 + P2 可读性：建议 6–11）

1. 新增 `docs/pico8-agent/WORKFLOW.md`，合并新建、修改、资源编辑、试玩四条流程；删除四份 SKILL.md、目录生成和“压缩后重读 skill”规则。参考文档继续按需读取。
2. 修改 `manifest.json`、`prepare-knowledge.mjs`、extension 注释/宿主说明和契约测试。保留 allowlist、语言/链接校验、Lua receipt 校验、hash 发布和只读挂载。删除旧 skill metadata 专用检查，增加 Workflow 链接和必需段校验。
3. 静态前缀按固定顺序组装 AGENT/MACHINE/WORKFLOW/调色板/宿主契约，动态项目状态仍在末尾。检查 compaction 后完整静态规则仍注入；不把固定前缀等同于所有服务商都支持缓存。
4. MACHINE 添加约 15–20 行可运行骨架：全局 `g` 包含 mode、实体表、计数和进度，`new_game()` 重新创建全部每局状态，`_init` 与重开共用，更新与绘制分离。持久最高分与每局状态明确分开；修改已有游戏时遵循原结构，不为这个约定重构无关代码。
5. Workflow 的验证顺序：读状态规划输入 → 正常起点走核心循环 → 短有限游戏正常胜利并重开 → debug 注入失败/边界 → 必要时再 normal reset。沙盒/无尽游戏按请求检查目标和重开，不强加胜利；局部修改只验证受影响路径。所有证据绑定最终提交版本。
6. 可玩版本后建议先用 12 次验证调用取得核心证据；这是软提醒，不硬中断。超过后应合并重复观察或换查询/输入策略；还缺必要覆盖就继续有目的地验证，无法完成则如实记录缺口。不得为满足调用数修改胜利条件。
7. 把画面可读性放在 Workflow：默认低对比背景、主体与交互目标明确分离、小物体用轮廓或形状区分、HUD 与场景隔离，检查原生尺度。提供推荐表，例如背景 0/1、环境 1/5、主体 7/10、可交互目标 9/11、轮廓 0；具体场景可调整，不只靠颜色编码。
8. 缩短 `references/playtest.md`，保留输入、状态、debug、裁剪的最小例子与正面动作指令；把证据局限、宿主线程/存档细节和历史评测说明移到维护者 README。实际行为限制（局部变量不可读、debug 后需正常路线）保留在工具附近。
9. 完成/交付回复固定四项：玩法 / 操作 / 已验证 / 未验证。局部修改可写“玩法、操作不变”；纯解释/计划请求按问题回答，不机械套游戏交付模板。
10. 同步 `app/AGENTS.md`、根 README、知识 README、REFERENCE_INDEX、兼容说明、资源指南、评测 README；搜索并清除未标历史的 replay/captureFrames/旧 skill 路径/unspecified 指令。

关键验收：知识包可编译，必需 Workflow 在初始和压缩后上下文中各出现一次，参考文件仍可按需读；模板经真实 WASM 启动及重开验证；小样本能直接动手且不再读取 skill。静态上下文目标约 9–10 KiB，实测 bytes 后记录，不靠删掉必要边界凑数。

### S4：小规模结果评测（P2：建议 12–13）

1. 移除“编辑前读 skill”的通过条件，保留请求范围、资源/源码原子提交和真实工具证据检查。复用已有 jump/enemy/map 独立验证器，增加状态查询/注入相关验收。
2. 报告固定字段：首次成功 load 的调用数、首个核心循环通过时的调用数、总调用数、观察占比、状态读取次数、debug 次数、工具错误率、结果文本 bytes、图像数量/尺寸、耗时及可获得的 token/费用。启动成功和真正可玩分列；没有独立核心循环证据则后者标 unknown。
3. 每次同时输出 Agent 正常路线/胜利/重开覆盖和独立验证器覆盖。独立验证器以最终未改写卡带在 fresh session 中执行输入，以预先定义的状态转移加画面断言判断；不能只信模型命名的 `g.won`、最后回复、frame hash 或“没有报错”。随机 fixture 固定种子；开放创作无可靠 oracle 的部分留给人工判断。
4. 用未来自两个案例的新任务：有限波次射击先做，跑酷和节奏待扩展。每个任务包含核心动作、胜利或阶段目标、失败、重开；参考指南只在对应题材按需提供，不把收集/消除模式放进通用前缀。
5. 最小真实模型试验先用现有可用模型跑 1 个修复 + 1 个新建，再用一个不同 provider 的模型跑相同任务。冻结 prompt/runtime/知识/预算，保留失败；不从单次结果宣称统计改善。
6. Claude/GPT/Kimi/GLM 纳入可配置对照矩阵，记录准确模型 ID、端点、能力和 thinking 配置；不要仅凭家族名推断图像能力。已有可用配置直接使用，缺失配置记未运行，不为矩阵齐全阻塞 P0/P1。
7. 用同一棋盘图片和问题比较 128 与 512 输入的识别结果；大幅减少一像素扫描是目标，实际效果由新数据决定。

验收：至少一个新类型的最终卡带由独立输入验证核心循环、目标和重开；状态读取确实替代棋盘逐行观察；工具参数错误、结果 bytes 与正常路线覆盖可对比。若结果退化，先定位工具可用性或 Workflow 误导，不直接扩大模型/题材矩阵。

### S5：纯文本模式（建议 14，依赖 S2/S3）

单独交付，不与状态工具首版混合。涉及 `model-catalog.js`、`model-config.js`、App 模型设置、Agent 内容编码、观察/资源工具、历史恢复和连接测试。

1. 模型目录以工具调用能力为前提，分别标注 text / vision；自定义模型不再硬编码 image 输入。按实际选择决定观察 profile。
2. text profile 默认状态/日志，按需 ASCII；为资源预览提供文本数据。统一模型消息编码层确保工具结果、历史截图、压缩上下文和连接测试都不带不支持的 image block，UI 仍可显示已有图片。切换模型时重新构造兼容上下文，不修改原始记录。
3. 连接测试分成 text+tools 与 vision+tools 两种。文字模式不声称验证配色和视觉可读性；完成回复将视觉检查留在“未验证”。
4. 以实际可用的纯文本模型（例如用户提到的配置）完成一个状态驱动小任务；不因模型 ID 出现在建议里就假定其接口能力。

验收：纯文本端点收到的所有请求无 image block，能读取棋盘并通过正常输入完成任务；vision 模式图像正常；跨模式恢复/切换不报错。之后才扩展剩余模型和题材矩阵。

## 验证策略：先关键链路，按证据扩展

本任务采用范围验证，覆盖代码改动的行为与边界；不因阶段数多而重复跑全套。实施时同步调整两仓库开发指引，使“所有修改无条件跑全套”的旧要求与本策略一致。文档计划本身只做 diff/链接检查，不跑应用或付费模型评测。

| 改动 | 最小验证 | 扩大条件 |
| --- | --- | --- |
| 输入/观察/结果 DTO | `observation.test.mjs`、`tool-capabilities.test.mjs`、`cart-tools.test.mjs`、记录相关存储测试；定向运行新增/受影响用例 | 影响版本提交、恢复或共享存储时补 agent-contracts / cart-store / sessions / workspace |
| C++/ABI/VM port | 重建 WASM + 类型构建 + source/manifest 校验；新增 debug/log 测试和 resource-limits/coroutine/standalone/lifecycle 相关测试 | 触及通用 hook、scheduler、host binding 或失败恢复，跑完整 `test:runtime`；跨包导出/架构变化补 architecture/public exports |
| 发布播放器 | 构建 release、release hash/许可证校验、Maker 消费真实产物、一次真实 Worker 联调 | 变动公共 transport/组件/发布文件集合时运行 verify:release 与 test:browser |
| Workflow/知识包 | prepare:knowledge + knowledge-files/pico8-extension/评测契约相关测试；新 Lua 骨架真实加载与重开 | 更改共享 compiler/receipt 机制则补所有知识样例验证；不重跑未改样例 |
| UI/消息 profile | 连接协议 fixture、模型设置/切换/恢复测试，一次浏览器 smoke | 消息恢复、持久化或公共 UI 状态回归不明时扩大到完整 app test |
| 静态构建 | 集成完成后跑一次 Maker build；检查新播放器和知识进入 dist | 改 hosting/packaging/资源输出路径时才补 test:sites |

常用定向命令从 `app/` 执行：

```sh
npm run prepare:app
node --test tests/observation.test.mjs tests/tool-capabilities.test.mjs tests/cart-tools.test.mjs
node --test tests/knowledge-files.test.mjs tests/pico8-extension.test.mjs tests/skills-evaluation.test.mjs
```

从播放器仓库执行（使用该仓库规定的 Node/pnpm/Emscripten，不混用 Maker 工具链）：

```sh
pnpm run build:wasm
pnpm run build
pnpm run verify:wasm
node --test tests/runtime/standalone-session.test.mjs tests/runtime/resource-limits.test.mjs tests/runtime/coroutine-policy.test.mjs
```

新增 debug/log 用例加入上面的定向清单。WASM 编译参数或工具链发生变化时补两次干净构建一致性验证。多处共享行为回归、无法定位失败或准备整体发布时，才运行 `pnpm test` / Maker `npm test`；已有相关检查通过且没有新变更时不重复执行。

## 提交边界与完成标准

按 S0 → S1 → S2 → S3 → S4 执行，S5 单独跟进。S2 内日志可先交付，再交付查询/调试；每次底层能力先在播放器仓库落地，Maker 再更新依赖。每个实现提交同步其实际文档与测试，不能提前发布尚不存在的工具说明。

- [ ] S0：基线冻结，结果指标与接口确定。
- [ ] S1：唯一 steps、×4 PNG、容错裁剪、精简 DTO、明确测试轮次。
- [ ] S2：日志、只读查询、受限 debug、自动标记和 fresh reset 在真实 WASM/Worker 上通过。
- [ ] S3：单一 Workflow 与骨架发布，旧 skill 路由及冲突文档清理。
- [ ] S4：结果评测替代过程评分，一个新类型完成独立正常路线验证，小规模模型对照保留实际结果。
- [ ] S5：纯文本请求全链路支持，额外模型/题材按结果扩展。

P0/P1 完成需同时满足 S1–S3，只有日志回传或文档变短不能算完成。交付记录列出实际实现、关键测试命令/结果、未运行的扩大检查及原因、仍缺的模型配置或验证证据。
