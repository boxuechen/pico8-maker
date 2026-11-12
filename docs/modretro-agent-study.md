# ModRetro Chromatic 对 PICO-8 Maker 的启发

研究日期：2026-11-13。

本次在本地找到与“创建 GBC 游戏的 mod64 插件”描述匹配的插件为 **ModRetro Chromatic**，安装清单中的名称为 `modretro-chromatic`，版本为 `1.0.34+codex.distribution.5efb7a8c2b1207f93f2a673a`。这里不将 mod64 当作已经验证的正式名称。

研究方式：读取安装包的 skill、参考文档、示例说明及部分已发布 JavaScript 实现，并对照 PICO-8 Maker 当前代码与知识库。没有运行新游戏生成实验，没有重新构建或试玩该插件的示例，也没有验证宿主原生标注 UI。因此，下文区分设计、实现证据和待验证效果。

## 结论

它提供的主要是强模型可以操作的游戏制作环境：GB Studio 原生工程、结构化编辑工具、按需参考、专项美术流程、真实模拟器和带上下文的用户反馈。已检查的通用 skill 没有展示一套覆盖经典游戏玩法、美术、音乐的自动检索知识库，也没有足够证据证明一句话能稳定生成好玩的游戏。

对我们的启发是补齐实际制作与反馈环节，并把知识绑定到具体任务和质量问题。暂时没有依据照搬一个庞大的“经典游戏蒸馏系统”。

## 1. 先区分引擎已有能力和模型创造能力

插件面向 GB Studio 的 `.gbsproj` / `.gbsres` 原生项目。空白创建支持 TOPDOWN、PLATFORM、ADVENTURE、SHMUP、POINTNCLICK 五种类型，创作指导优先采用已有场景类型、事件和变量，再按需扩展引擎。

证据：`dist/project-session.js` 中的 `BLANK_PROJECT_GAME_TYPES`；`skills/modretro-chromatic-authoring/references/extensions-and-build.md`。

这意味着插件可以利用引擎已有的场景行为与原生资源结构。我们的模型通常在一份 Lua 中实现具体游戏规则、控制和状态转换。两者创作任务的负担不同，不能把插件的潜在稳定性全部归因于模型或提示词。

可借鉴：保留可选、经过验证的小型控制与机制示例。先根据实际生成失败决定补哪些，避免强制每个游戏套用完整模板。

## 2. 用户流程：尽早可玩，反馈能定位到具体版本和画面

创作 skill 明确要求尽早展示成功构建的可玩版本；持续迭代时复用预览，在不打断玩家、存档和录制的时机更新。

预览的 Annotate game 设计允许用户冻结画面，选取硬件精灵、推断的精灵组、背景图块或整帧，预览颜色并经宿主发送反馈。反馈附带 ROM 哈希、源码版本、帧与硬件上下文。

实现证据：`dist/web-annotations/bridge.js` 构造包含 `sha256`、`sourceRevision`、`frame` 的快照；`targets.js` 提供整帧、图块及 OAM 目标；`native.js` 对接宿主 annotation API。

边界：

- 对象分组是硬件层推断，不是角色名或源码资源的可靠映射。
- 颜色预览不会直接修改 ROM、素材或源码。
- 功能依赖宿主标注支持。本次只检查实现，未完成原生 UI 验证。
- 画面标注有助于定位视觉和交互问题，但不足以表达长期节奏、策略或音乐问题。

PICO-8 Maker 已有可玩预览、独立测试 Worker、关键帧时间轴和版本信息。一个更轻的借鉴方案是让用户在反馈中附上当前试玩截图、卡带版本以及可选选区。无需先实现硬件对象识别；时间轴的 agent 测试帧也不能冒充用户刚刚玩的状态。

## 3. 美术知识：按任务分流，并要求实际质量审查

Pixel-art skill 按新静态精灵、背景/瓦片、精确像素修改、动画和导入转换分流，再按需读取专门参考。

`genre-art-direction.md` 提供通用视觉标准及俯视 RPG、平台、策略、射击、冒险等分类指导，包括：

- 玩家、目标、危险和装饰的明暗与轮廓区分。
- 将对比度留给需要玩家决策的位置。
- 动画锚点、脚部接触和首尾衔接。
- 在原生尺寸、实际镜头、UI 与活动角色一起出现时检查。

这属于轻量、与任务紧密相关的专业参考，而非完整的经典游戏知识库。

新静态精灵的一个路线是“生成粗设计 → 在固定网格重建 → 提取真实像素 → 检查 → 导入”。文档明确记录网格细分、颜色和轮廓失真等失败，以及实验的有限可靠性。这套成本较高的流程不能直接推定适合 PICO-8 的小尺寸精灵。

动画路线则强调保护认可的静态形象，直接制作原生帧，按实际时序观看。`prompting-grid-animation.md` 留有一个具体失败案例：用户认可眨眼，却指出脖子变形、尾巴很差；后续保留眨眼、重做尾巴，而不以像素计数通过代替视觉接受。后续版本仍标为待动态审查。

可借鉴：为我们现有 assets skill 增加简短的原生尺寸可读性、动画连续性和游戏内整合指导。技术格式验证与审美判断分开。按任务读取，不把所有类型规则装进启动上下文。

## 4. 试玩：保留失败证据，支持可比较的修改

插件提供精确帧按键、真实帧截图、录制历史、已留存片段审查、联系表、同构建检查点和可选源码调试。

核心要求是保留首次失败和输入；修改源码并重建后，从可比较的起点重复相关输入。检查点只能恢复到相同 ROM 和运行时，不能跨重建直接使用。

证据：`skills/modretro-chromatic-rom-debugging/SKILL.md`、`docs/stepped-playtesting.md`、`docs/recorded-playtesting.md`，以及本次会话暴露的 emulator 工具描述。

PICO-8 Maker 已有实际输入、明确检查点截图、执行进度和帧/版本身份。现有基础足够开展创作评估，不需要立刻复制整套录制系统。

可增量借鉴：针对运动、碰撞和动画问题展示带时间信息的连续帧；将失败输入与游戏版本一起保存，便于修复后比较。具体工具需求应来自评测，不以工具数量作为能力指标。

## 5. 音乐：没有找到同等成熟的通用创作工作流

项目格式支持音乐、声音资源；浏览器预览支持音频播放和录制。Wrecklight 的设计文档也明确描述音乐情绪、标题音乐发展和事件音效职责。

但在本次检查的五个公开 skill 及工具目录中，没有看到独立的通用作曲、音效设计与模型听评闭环。其调试文档明确指出截图和运行吞吐不能证明音频体验。

因此不能以该插件证明“音乐能力已被自动解决”。PICO-8 Maker 的 `audioObservation:false` 仍是明确边界。第一步可以规定各类声音的用途和可听测试，由人实际听取；只有模型与工具链具备相应能力时，才讨论音频观察与自动分析。

## 6. 示例是可编辑起点，不是创作能力评测

- Starter：最小原生项目，没有预设完整玩法。
- Signal Lost：灯塔、两颗可收集信号火花和终局的短篇示例，提供完整原生资源与事件结构。
- Wrecklight：具有移动、工具升级、探索、Boss、视听方向的完整设计文档，支持从匹配来源复制可编辑工程。本地紧凑包不包含其完整项目，需另供匹配源码。

Wrecklight 的设计文档开头明确是预期创作方向；2–4 小时时长、Boss 阶段、性能等属于设计目标，不能当作本次验证的实现结果或用户满意度。示例构建与针对性行为检查也不能证明任意新游戏的生成质量。

## 7. 对我们当前路线的建议

| 顺序 | 建议 | 需要解决的问题 |
| --- | --- | --- |
| 先做 | 用当前产品里的强模型跑一句话创作和一次反馈迭代 | 确定真实瓶颈，建立改进基线 |
| 低成本候选 | 增加少量按需视觉/动画质量参考，补充全游戏体验检查 | 区分能运行、资源合法和体验完成 |
| 产品候选 | 用户反馈附带当前游戏截图与版本，可选选区 | 减少“这里不好看/这里过不去”的定位歧义 |
| 按失败补充 | 小型机制、像素制作和故障修复案例 | 帮助模型解决反复出现的具体问题 |
| 有需求再做 | 连续帧审查、可复现尝试、音频分析 | 扩大反馈闭环的可观察范围 |

上述候选不是已证明有效的改进。用相同模型、类似题目和未见过的主题比较加入前后的结果，记录失败、延迟和人工修改量。不要同时引入大量知识和工具，以免无法判断收益来源。

## 本地证据入口

插件安装根目录：

`/Users/boxue/.codex/plugins/cache/openai-curated-remote/modretro-chromatic/1.0.34+codex.distribution.5efb7a8c2b1207f93f2a673a/`

以下路径相对于该根目录：

- `.codex-plugin/plugin.json`：身份与安装版本。
- `skills/modretro-chromatic-authoring/SKILL.md`：原生工程、早期可玩预览、任务路由。
- `skills/modretro-chromatic-authoring/references/extensions-and-build.md`：已有引擎能力与扩展策略。
- `skills/modretro-chromatic-pixel-art/SKILL.md`：美术任务分流。
- `skills/modretro-chromatic-pixel-art/references/genre-art-direction.md`：视觉质量标准。
- `skills/modretro-chromatic-pixel-art/references/prompting-grid-animation.md`：动画流程与真实反馈案例。
- `skills/modretro-chromatic-pixel-art/references/prompting-recoverable-grids.md`：生成、恢复与失败边界。
- `docs/agent-guide.md`：预览、标注与证据说明。
- `dist/web-annotations/{bridge,targets,native}.js`：标注实现。
- `dist/project-session.js`：空白项目场景类型。
- `skills/modretro-chromatic-rom-debugging/SKILL.md`、`docs/recorded-playtesting.md`：试玩、录制和回归。
- `docs/wrecklight-design.md`、`docs/wrecklight-remix.md`：完整项目设计与样例边界。
- `examples/dogfood-signal-lost/README.md`：短篇原生示例。

PICO-8 Maker 对照入口：

- [现有知识与宿主契约](pico8-agent/README.md)
- [创建流程](pico8-agent/skills/pico8-create/SKILL.md)
- [资源流程](pico8-agent/skills/pico8-assets/SKILL.md)
- [玩法设计参考](pico8-agent/references/game-design.md)
- [运行时能力](../app/src/pico8/capabilities.js)
- [真实模型评测及其边界](../app/scripts/evaluation/README.md)
