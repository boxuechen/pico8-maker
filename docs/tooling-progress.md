# Agent 工具与 Workflow 实施记录

2026-11-13：S0、P0（S1、S2）与 S3 已完成。S4 评测实现与关键回归已完成，真实模型/图像对照按用户要求跳过；S5 待实施。S0–S3 未调用付费模型，S4 的真实请求被服务商 403 拒绝，详见文末和 [S4 记录](s4-evaluation.md)。

## 交付与边界

| 层 | 已实现 |
| --- | --- |
| VM / bridge | ABI `0x00010006`，raw 路径查询、受限 Lua debug、有界日志；复用同一 VM 和 callback/custom-loop 安全边界 |
| standalone | 显式 `{inspection:true}` 的 memory session；公开 `inspect`、`prepareInspection`、`INSPECTION_LIMITS` 与 `readLogs`；实时 Web facade 无调试入口 |
| Maker | 第九个工具 `inspect_game`；debug 发送前标记整轮，记录 pending/completed/failed/unknown 和至多 256 字符的失败原因；已执行失败、超预算或未知结果要求 reset |
| 输入与观察 | 只接受 steps；模型 PNG 最近邻 ×4；区域取屏幕交集；精简白名单 DTO，预算只随源码 read/load 返回 |
| 轮次与隔离 | 每次 load/reset 新建 session 和内存存档；记录格式 v3，不转换旧格式；源码、资源、导出和实时试玩不受临时调试影响 |
| 指标 | 冻结去重基线；采集首个 load、错误、观察、状态查询、debug、文本 bytes 和图像尺寸；没有独立证据时通关覆盖为 unknown |

播放器依赖：`4c28b861ce8d2536229b6b723b8b7c9a57e85d07`；日志切片此前单独提交为 `bbcbbf6`。Maker 的 `ref/` 不入库，底层能力已在播放器仓库单独提交，根 README 和来源文档指向当前依赖。

查询只读取全局可达值；raw table 访问不运行元方法，序列化不执行 finalizer。返回稀疏 table 的 key/value entries、类型和截断标签，不返回 VM 地址。限额为 16 条路径、16 段/路径、4 层、512 entries、16 KiB 输出；Lua debug 4 KiB/50,000 指令，复用固定 VM 内存限制。代码和键按 Lua byte string 的 code points 0–255 编码。生命周期、yield、外部操作和存档写入口在 VM 层受限，缓存别名/pcall/嵌套协程不能绕过；已执行异常不回滚部分赋值，必须重置。

每次 debug 尝试增加 stateSeq；frameStateSeq 标识现存画面的状态序号。debug 不隐式 update/draw，下一次完成帧才刷新图像；若下一帧故障，仍标明画面早于注入。正常/调试标签描述测试方式，不自动判定游戏通过。语法失败也保守标为 debug；只有 fresh load/reset 开启新 normal 轮次。

日志每 VM 最多 64 条 / 8 KiB 原始字节 / 每条 1 KiB；交付 cursor 在结果成功编码后推进，编码失败恢复 cursor。启动和故障日志保留，溢出报告 dropped。图像、ASCII、日志和故障诊断分别编码。

## 冻结基线

[机器可读基线](tooling-baseline.json)固定 Maker/runtime 版本、归档 hash、模型配置、历史知识版本和最终卡带 hash。复算：

```sh
node app/scripts/evaluation/freeze-tooling-baseline.mjs --check
```

| 案例 | 去重调用 | 观察 | 单行观察 | 工具错误 | 文本 UTF-8 bytes | 图像 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sweet Garden | 176 | 88 | 68 | 2 | 267300 | 119 |
| Lodge Podge | 157 | 27 | 0 | 10 | 238988 | 215 |

累计归档含此前轮次完整历史，按 tool-call ID 去重，不能逐轮直接相加；缺失返回值单独计数。独立案例证据有 hash，本轮未重跑历史模型批次，不将旧声明当作当前通过证据。旧 skill 检查仅留在历史归档；S3 已从当前 evaluator 删除读取先决条件，改用 workflow-scope。

## 实际验证

- Runtime `test:runtime`：281 项通过；因共享 VM hook、协程边界变化而扩大到整个 runtime 范围。包含真实 WASM、正常输入、生命周期、资源限额、日志，以及查询/调试测试。
- 新状态测试：raw/nil/false/稀疏键/Q16/循环/深度/条目/字节上限；查询前后画面、时间和随机序列一致；callback/custom-loop 连续执行；死循环、嵌套协程、pcall 吞错/内存超限、缓存入口、受限操作、reset 恢复。
- Runtime architecture/public exports：16 项通过。`verify:wasm`、`verify:release` 及 3 项 artifact 检查通过；Emscripten 6.0.5 的两次干净构建字节一致，hash 与当前锁文件一致。
- Runtime Chrome `session-loop` 和 `persistence-lifecycle` 通过；覆盖主线程/Worker 和设备清理，无未处理 rejection。
- Maker 相关知识/工具/存储/工作区/Agent/观察：79 项组合检查通过。补充调试后的零完成帧故障用例后，状态与工具 25 项通过；最终 release 的实际 Worker 与卡带工具 11 项检查通过。
- Maker 关键状态用例：同一未改写源码正常输入通关、注入边界胜利、只读不发 PNG、源码/导出/live 隔离、记录持久化、无效参数零 dispatch、STOP/丢失响应保留 debug 标记、新 reset 恢复正常起点。
- 真实 Chrome Maker Worker 联调：load → read → debug → input → 胜利 → reset；PNG 实际为 512×512，负坐标及右/下溢出裁剪正确，正常/调试轮次和旧帧序号正确。
- 知识包编译、基线复算和最终生产构建通过；Vite 仍提示现有大 chunk 体积，未作为本次工具改造扩大打包范围。

固定空卡带真实 observation 与旧编码器比较：常规头部 711 → 197 UTF-8 bytes，减少 72.3%；测试要求无日志的普通头部 ≤500 bytes。尚无新模型对照数据，不能据此宣称 Agent 总调用数或视觉识别率改善。

未运行完整 Maker `npm test`、完整播放器 `pnpm test`、Sites 检查或付费模型矩阵：本次无 hosting 改动，相关共享行为已由上述扩大/定向检查覆盖，未出现需要继续扩大的失败。上述为 P0 验证范围。S4 新题材与模型对照、S5 纯文本模式仍未实施。


## S3：统一 Workflow（2026-11-13）

已删除四份 SKILL.md、目录生成、pico8_skills section、读取先决条件和压缩后重读规则。固定前缀按 AGENT → MACHINE → WORKFLOW → 调色板 → Host 注入，动态 Project 状态在末尾。详细参考继续按需加载、校验 hash 并只读缓存；旧 skill 路径明确拒绝，不做兼容映射。发布包由 31 份降为 27 份，版本 `pico8-files-v1-1f5ab26ff1f0d473`。

Workflow 包含新建、修改、资源、试玩、画面可读性与四项交付格式。试玩优先读状态规划输入、正常路线核心循环/胜利/重开，再用 debug 验证边界；12 次验证调用仅作软提醒。可读性要求和推荐配色进入启动前缀。MACHINE 增加 20 行可运行骨架，通过全局 g 和 new_game() 重建每局实体与计数，把持久数据留在局外。

静态 provider system 前缀（不含动态 Project 和 tools schema）实测 **10,273 UTF-8 bytes，约 10.0 KiB**。WORKFLOW.md 为 6,381 bytes；playtest 参考从 9,185 缩至 4,546 bytes。宿主隔离、日志细节和证据局限集中到维护者 README。未从字节变化推断实际模型效率或缓存命中率。

当前 evaluator 删除 selectedSkills/resourceSkillBeforeEdits 与技能读取指标，scope profile 为 workflow-scope；scope/原子编辑/实际输入/独立像素验证保留。当前入口重命名为 workflow-cases、workflow-browser 和 evaluation-recorder，使用 `/__evaluation` 与新的 evaluation-<id> 归档目录。历史归档和冻结基线仍保留原名与原 hash。新题材、模型矩阵和更完整的结果评测留给 S4。

验证：

- 知识/扩展/Workflow/compaction/Agent/评测关键组合 30 项通过；补充编译器顺序拒绝与必需 Workflow 离线检查后，相关入口与工具回归 33 项通过（两组有重叠）。
- 骨架在真实 WASM 中通过启动、收集三目标获胜、左边界失败、两种重开及完整状态替换；临时字段与修改过的实体消失，局外 best score 保留。
- 脚本化 provider 通过真实 Agent 和工具链直接 load_game 开始，无前置文档调用，完成正常胜利/重开。实际 Pi compaction 及恢复后的 provider 请求均包含完整且仅一次的有序静态正文；动态 Project 可更新，旧 catalog 不回流，工具不重放。此 fixture 不代表真实模型自主创作质量。
- 编译器保留语言、虚拟链接、allowlist、hash 和 Lua receipt 检查；新增缺失 Workflow 必需段、缺失/乱序启动 section 拒绝；已有过期/失败 Lua receipt 检查通过。
- 生产构建通过；Chrome 157 烟测确认新评测入口、浏览器知识加载、旧路径拒绝和本地归档 200，未调用模型，无页面错误或未处理 rejection。既有 Vite 大 chunk 提示保留。

本阶段无 runtime、hosting 或共享存储实现变更，定向检查覆盖了受影响入口，未扩大到完整 npm test、runtime 回归或 Sites 检查。付费模型和 S4/S5 未运行。

## S4：结果评测实现（2026-11-13）

已增加两波射击的新建/修复任务、状态和画面联合 oracle、最终版本正常路线复核、可配置 provider 矩阵、指标归档以及同棋盘 128/512 对照。实现、运行方法和证据范围见 [S4 记录](s4-evaluation.md)。

真实 Kimi 请求遇到订阅权限 403，原始失败已经归档；其他 provider 缺少本次配置。用户随后要求跳过对照验证。S4 实现及 21 项关键测试、历史基线复核、生产构建与本地预览检查已完成；真实模型和图像对照保留入口，未把脚本 fixture 的通过当作模型效果。
