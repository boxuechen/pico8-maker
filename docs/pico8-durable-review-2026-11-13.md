**PICO-8 专用 Agent 的 Pi Durable 接入审查 · 2026-11-13**

结论：保留现有的单 Agent、薄 extension、领域工具、常驻规则与按需 skills。需要优先处理的是两个已经复现的工具/上下文契约问题，再补齐卡带约束反馈和当前 skills 的行为评测。下文保留首次审查时的发现；当时只审查并记录，没有修改应用代码或调用付费模型。

后续修复：用户授权后已实现这四项，并使用网页保存的 DeepSeek 配置完成真实模型评测。实现、验证和两轮完整结果见[修复与评测报告](pico8-agent/research/runs/2026-11-13-skills/README.md)。

审查对象为本地提交 `cdcab9b`、安装的 `@earendil-works/pi-durable@1.5.2`，以及 GitHub main 在审查时的提交 `2443c687e3fbc53af7b3a8ab8dc21a170cdf0d51`。上游 main 中的 package.json 也标为 1.5.2，但 main 已有安装包没有的接口和示例，例如 signals；版本字符串相同不代表 npm 发布内容与 main 完全相同。API 决策以安装包类型和实现为准。

上游将 Durable 定位为构建 agent 应用的 harness，应用自行决定环境、工具与指令。它与终端里的 Pi coding agent 是不同产品。因此，这个项目用浏览器虚拟工作区和 PICO-8 专用工具，是符合其设计的。[官方介绍](https://earendil.com/posts/pi-durable/)

| 层 | 当前实现的判断 | 建议 |
| --- | --- | --- |
| Tools | 9 个工具覆盖读取、定点修改、原生资源、加载、输入和观察；规模适中 | 保留工具集合；修复大文件读取契约，增强领域状态反馈 |
| System prompt | 身份/共享规则、机器约束、宿主能力、索引与项目状态分开 | 保留分层；修复本轮修改被标记为历史失效的问题 |
| Extension | 注册 sections 与 tools，业务执行留在 Game | 保留薄层；可将串行要求也声明到工具级，防止其他宿主漏配 |
| Skills | create/edit/assets/playtest 元数据常驻、正文通过 read 加载 | 保留四个职责；增加针对实际行为的评测 |
| 会话与恢复 | MemoryStorage 运行，应用 IndexedDB 保存 cart/session，重建 transcript | 符合目前“恢复历史但不重放任务”的产品规则；暂不迁移 |

Durable 的 section 是 system prompt 的组成部分；`agent.instructions` 是追加在扩展 sections 后的另一段指令，不是专用 Agent 必须使用的独立主提示词。因此，不需要为了“专属 Agent”把现有 sections 重新拼成一个大字符串。extension 的 `tools/sections/hooks/wraps/tasks` 也不要求全部实现。[上游 README：Extensions / System Prompt](https://github.com/earendil-works/pi/blob/2443c687e3fbc53af7b3a8ab8dc21a170cdf0d51/packages/durable/README.md#system-prompt)

本地测量：不含动态项目段、XML 包装和 provider 转换，7 个 section 正文合计 7,587 个 JavaScript 字符；9 个工具的 name/description/parameters 序列化后为 8,783 字符。这不是 tokenizer 的 token 数。当前没有把整个参考库或四个 skill 正文常驻，未发现需要大幅削减常驻内容的依据。

**1. 优先修复：read_game 的“完整源码”承诺与 Harness 输出边界不一致。**

[`tools.js`](../app/src/pico8/tools.js) 将 read_game 描述为完整读取，但只给 read_assets 和 observe_game 设置了专门的 outputLimits。安装版 Harness 默认最多保留 50 KiB / 2,000 行。[`Game.perform`](../app/src/game.js) 虽然返回完整字符串，模型最终接收到的内容仍会被 Harness 截断。[`pico8-edit`](pico8-agent/skills/pico8-edit/SKILL.md) 又明确要求通过 read_game 获取现有源码。

通过真实 Agent → Pi Harness → mock provider 的请求链路复现：55,047 字节源码经 read_game 后，返回包含 51,291 字节文本（其中包含截断提示）；末尾 `TAIL_SENTINEL` 丢失，Harness 报告丢弃 3,847 字节。这不是静默截断，但工具没有分页参数，描述也没有指出如何继续。模型只重复 read_game 无法拿到尾部。

建议保留 read_game 的便捷入口，明确它是有界读取；复用内置 read 的行范围/续读行为，告诉模型通过 `read({path:"/cart/main.lua", offset, limit})` 读取缺失区间。编辑 skill 同步允许按范围读当前源码。不要通过取消输出边界或新增源码字符上限解决。回归需要经过 Harness，而不只是直接调用 game.execute；覆盖字节和行数两种截断，并验证尾部可继续读取。

**2. 优先修复：动态项目提示会把 Agent 自己的修改标记为过期历史。**

[`sessionContext`](../app/src/sessions.js) 比较 `lastContentVersion` 与当前 `contentVersion`，不相等就输出“Previous source, resources and test results in this history are stale”。[`App.jsx`](../app/src/App.jsx) 在 draft 修改或提交版本时增加 contentVersion，但直到整次 sendMessage 结束才更新 lastContentVersion。Pi 在每次模型请求前重新渲染 section，所以这个差异会在同一轮工作中触发。

复现：会话和 cart 初始均为 contentVersion=3；第一轮工具把 `print(1)` 改成 `print(2)`，按应用规则增加到 4；第二次 provider 请求就出现上述 stale 指令。期间没有切换会话或外部修改。这会让提示对历史失效范围的描述过宽；是否因此导致某个真实模型重复读取或重测，尚未量化。

建议区分三个事实：进入本轮之前其他会话造成的变化、本轮自身已知的修改、尚未提交的 draft。跨会话失效提示以进入本轮时的基线计算，并明确失效的是较早上下文；动态版本/dirty 状态单独呈现。不能简单移除过期提示，否则会丢掉已经正确实现的跨会话同步保护。回归同时覆盖“自身 edit/load 后不误报新证据失效”和“其他会话改动后仍要求读取当前 cart”。

**3. 建议补齐：把 PICO-8 卡带约束反馈给模型。**

当前 UI 通过 [`countTokens`](../app/src/pico8/tokens.js) 显示近似代码 tokens，但 load_game 的模型结果只包含运行观察和提交说明，没有代码预算反馈。常驻 MACHINE.md 也没有代码 token 目标；相关提醒在按需 memory-storage 参考中。PICO-8 官方列出的代码上限是 8,192 tokens。[官方手册](https://www.lexaloffle.com/dl/docs/pico-8_manual.html)

本地用完整 `.p8`（经应用 cartBytes 编码）实测：一个应用计数为约 9,012 tokens、15,058 字符的程序能加载，并产生帧，运行诊断为空。因此，当前 WASM 的启动成功不能替代卡带限制检查。这里的 9,012 是应用近似计数，不是官方编辑器验证结果。

建议在 load_game/read_game 返回简短的 `codeTokensApprox`、源码长度、draft/committed 标识及相关提示，常驻机器约束只增加一行目标说明。不要给应用加任意硬上限；近似计数也不应冒充官方兼容性认证。压缩尺寸等当前未验证的条件保持明确。

可一并使结果携带明确的 committed cart revision 或内容标识。现有观察已经有 runtime sessionId/generation/revision/frameId；其中 runtime revision 与应用 cart revision 是不同概念。补充二者的关联会帮助失败回滚、资源单独修改和会话恢复后的证据解释。

这类模型需要的信息放在 `output`；UI 需要的结构放在 `details`。`structuredOutput` 是供工具程序调用者使用的通道，不能假定模型会看到它。若使用 details，恢复序列化也要保留对应字段；目前 compactTranscript 只保留选定的 entry 内容。[上游 README：Tools](https://github.com/earendil-works/pi/blob/2443c687e3fbc53af7b3a8ab8dc21a170cdf0d51/packages/durable/README.md#tools)

**4. Skills 的结构可以保留，下一步验证其行为。**

Pi coding-agent 文档描述的模式就是启动时公布名称、说明和路径，匹配任务后读取 SKILL.md；它也明确承认模型可能不主动加载。我们的固定 manifest 集成适合浏览器宿主。Durable 本身没有要求接入 coding-agent 的目录扫描、slash commands 或 package 安装器。[Pi Skills 文档](https://github.com/earendil-works/pi/blob/2443c687e3fbc53af7b3a8ab8dc21a170cdf0d51/packages/coding-agent/docs/skills.md)

当前 tests 证明元数据进入模型请求、正文按需加载且无游戏副作用；因为工具选择是 mock 预设，它们不证明真实模型会正确选 skill、实际试玩或及时结束。历史 [DeepSeek pilot](pico8-agent/research/runs/2026-11-12-deepseek-flash/README.md) 使用的是旧工具协议和旧知识版本，也不能替代这次分层的验证。

建议用固定用例评测当前实现：新建游戏、局部 bug 修复、仅改资源、仅试玩、仅解释规则、长对话压缩后继续工作。记录首个可玩版本耗时、skills/参考读取次数、实际按钮操作、核心玩法完成度、无关内容改动、是否自然结束。每种任务重复运行，并覆盖至少两个实际使用的模型；固定应用版本和模型配置。先修前两项，再决定是否要改 skill 文案。

现阶段只在 create/playtest 中补充精简的 PICO-8 检查项即可：必要时检查初始角色可见、目标可达、核心资源守恒、持续不操作或单键连按是否绕过核心玩法。按请求相关性选择；不把这些变成每次小修改都必须完整重测的固定流程。

**其余机制的判断。**

当前全局 `toolExecution: "sequential"` 与 Game 队列保证按键、重置和加载串行；read/read_assets/read_game 标记 safe，load/edit_assets/reset/input/observe 保持 unsafe，符合各自副作用。observe 会懒初始化 Worker、暂停 live player，不能只因名称像读取就改成 safe。工具级 executionMode 可作为 extension 跨宿主复用时的加固，当前应用并没有并发执行错误。

自动 compaction、默认 retry、high thinking、手动 STOP、模型正常 final 结束，可以保留。当前产品规则明确不设 maxTurns；没有证据支持为了专用化引入 finish 工具、自动 onYield/afterRun 续跑或多 Agent 调度。若以后加入 hook，优先用于记录可验证的结果或执行确定性校验，不要让它把每个正常完成都再次送回模型。

当前 MemoryStorage 加应用恢复是一项明确取舍：保留 cart、版本和对话，刷新后不自动重放 WASM 操作。它不具备 Durable 原生任务断点续跑的完整保证。上游和安装版已有 IndexedDbStorage，将来若产品要求刷新后继续未完成任务，可以评估迁移；需同时处理数据库独占、提交与 cart 状态的一致性、WASM 重建和 unsafe 工具中断，不能仅替换构造器。[上游 README：Storage / Persist and Resume](https://github.com/earendil-works/pi/blob/2443c687e3fbc53af7b3a8ab8dc21a170cdf0d51/packages/durable/README.md#storage)

建议实施顺序为：修复 read_game 续读契约 → 修复项目状态的失效范围 → 补充卡带预算与版本反馈 → 运行当前 skills 的小规模行为评测。继续围绕 PICO-8 的创作与验证闭环改进。

本次验证：`cd app && npm test`，75/75 通过；另外完成大源码读取、同轮自身修改提示的 Harness 复现，以及完整 `.p8` 的真实 WASM 边界试验。未进行新的真实模型生成评测、官方 PICO-8 编辑器验证或浏览器 UI 回归。只新增本审查文档。
