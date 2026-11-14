# S4 结果评测

> 2026-11-14 起 S4 只跑 shell 流程（唯一的 Agent），指标 schema 3 统计 bash/p8 调用与 `Maker:` 提交行；最新结果见 [development-status.md](development-status.md#验证与证据)。下文是 2026-11-13 的实现记录，提到的冻结工具已删除。

2026-11-13：S4 评测实现与关键回归已完成，真实模型和图像对照验证按用户要求跳过。此前一次 Kimi Coding 尝试返回 403（订阅无访问权限），失败记录保留；Claude、GPT、GLM 未运行。本次不形成模型效果结论，保留矩阵和图像对照入口供后续使用。

## 已实现

- 两个此前收集/消除案例之外的任务：确定性的两波射击新建，以及同游戏的受伤无敌修复。任务明确全局状态接口、碰撞和绘制规则，便于不同模型共享 oracle；这是受约束的小型任务，不代表开放创作质量。
- Node 运行器使用正式 Agent、Pi provider adapter、Game 和 test Worker。只替换浏览器 Worker 传输与 PNG 编码；使用一次性卡带，不访问产品持久化数据，不修改 runtime 或模型提示词。
- 每任务固定 180 秒、观察到第 40 个工具调用时停止，保留已完成和缺失的工具结果。时间不包括后续独立验证；调用阈值由异步 transcript watcher 触发，实际调用数仍如实记录。每个模型各跑修复、新建一次，不自动重试整场试验或挑选最好成绩。
- 独立验证器在 fresh session 中加载最终原始卡带，只读状态并执行正常输入。逐帧确认弹道移动、对应碰撞、敌人移除、HP 变化和像素反馈，再验证两波胜利、失败及两种结局后的重开。离轴射击不得击杀；受伤必须启动并倒数 20 帧无敌。输入步骤、关键画面 PNG、状态及帧 hash 一起归档。
- Agent 覆盖单列：只重新执行最终卡带 hash 匹配、完整、非 debug 的记录；输入终点须与原始画面 hash 一致，每帧仍经过状态/画面 oracle。一次 debug 尝试会排除整轮，不能将注入状态后的结果计入正常路线。未取得可接受证据时保持 `unknown`。
- 原 jump/enemy/map 和范围、原子提交检查保留。修复任务检查资源未改写；两任务都要求提交的卡带与草稿一致。全部通过还要求 Agent 自己的正常核心循环、胜利、失败和重开均有证据。

## 指标和证据

S4 报告 schema 为 2，冻结历史基线的 schema 1 统计保持不变，不增加迁移分支。

| 字段 | 定义 |
| --- | --- |
| `firstSuccessfulLoadCall` / `firstSuccessfulLoadMs` | 第一次成功加载的调用序号/时间，不表示游戏可玩 |
| `firstVerifiedCoreLoopCall` | 最终卡带的可接受 Agent 正常路线第一次出现移动弹道与有效命中的调用序号；否则 `null` |
| `toolCalls` / `byTool` | 按 tool-call ID 去重，包含失败和缺失结果 |
| `observationShare` / `onePixelRowObservations` | observe 占比与一像素行观察；不与新状态读取混算 |
| `stateReads` / `debugExecutions` | 两种状态调用的尝试数，含缺失结果 |
| `errorRate` / `missingResults` | 工具结果失败率与缺失数；provider 失败另记 `status/error` |
| `resultTextBytes` / `images` / `imageDimensions` | UTF-8 工具结果文本量及图像尺寸分布，不把图像 base64 当文本成本 |
| `agentCoverage` / `independentCoverage` | 分别统计 coreLoop、victory、failure、retry |
| `elapsedMs` / `verificationMs` | 模型阶段与验证阶段分别计时 |
| `usage` | 有上报的 token、未上报代次数、费用；无数据为 `null`，目录估算与服务商实收分开标记 |

每批保存源码、评测器、完整 runtime release、知识包、依赖锁文件及各文件 SHA-256，还记录模型 ID、端点、adapter、输入能力来源、有效 thinking 配置、预算和 prompt hash。运行时修改这些文件后，应启动新批次，不能混用结果。

同棋盘图像试验分别发送 128×128 和最近邻放大的 512×512 PNG，两个独立上下文使用同一问题。固定先 128 后 512；保存原始回复、36 格正确数、完全匹配结果、耗时和上报用量。每个分辨率只有一次请求，未控制顺序与服务端缓存，不推断统计优势或图像 token 机制。

## 运行

从 `app/` 执行，先确保 runtime release 与知识包已经准备好：

```sh
npm run prepare:app
npm run test:s4
npm run eval:s4 -- --run --matrix scripts/evaluation/s4-matrix.example.json
```

最后一条会调用配置好的服务。复制 example 到 ignored `.cache/` 自定义矩阵，填写准确模型 ID 与端点，并通过每行 `apiKeyEnv` 指定的独立环境变量提供凭据。不要把密钥写进矩阵。不要把某服务的同名环境变量自动当作另一服务的密钥。内置 provider 使用锁定目录能力；自定义 OpenAI 兼容端点必须显式声明 `input: ["text", "image"]`，这是配置声明而非已通过图像测试。纯文本模式属于 S5。

缺少模型/端点或密钥的条目明确 `not_run`，不选择默认家族模型。每批目录为 `.cache/evaluations/s4-<uuid>/`，包含 `report.json`、最终 `.p8`、两张棋盘 PNG 与冻结文件。报告保存两类路线，不把独立验证的输入算成 Agent 调用。provider 错误不会成为零调用“成功”样本。

## 本次证据与缺口

- `npm run test:s4` 的 21 项关键测试通过，历史基线复核通过；生产构建成功，本地预览正常打开。未扩大到完整测试。关键回归覆盖真实 WASM oracle、假进度拒绝、画面不一致、无敌计时、重复通关后的重开、最终版本过滤、整轮 debug 排除、Worker 启动取消、费用未知值和图像缩放。
- 脚本 provider 经正式 Agent/Worker 跑新建、修复：各 5 次工具调用，首个成功加载为第 1 次，核心循环证据为第 3 次；1 次状态读取、0 次逐行像素观察；四项正常路线和独立验证覆盖都通过。此数据只证明评测管线可用，不能代替真实模型结果。
- 真实尝试归档：`.cache/evaluations/s4-b914b47f-3a2b-48d8-8d0d-f65b802aab36/report.json`。Kimi `kimi-for-coding`，`https://api.kimi.com/coding/v1`，high；两任务均在生成前被 403 拒绝，工具调用为 0，token/费用未知；128/512 图像请求也被拒绝。原始失败与当时的执行快照保留。该初次归档将生成拒绝标为 `unanswered`；当前实现已用回归测试确保 provider 错误记录为 `error`，没有覆写原档。
- 尚不能证明真实模型使用状态查询替代逐行扫描、正常通关率改善、调用/字节成本下降或 512 图像识别更好。跨 provider 最小对照及有效图像试验按用户要求跳过；跑酷、节奏和纯文本模式未扩大实施。
