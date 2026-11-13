# S0 / P0 实施记录

目标保持为 S0 + P0（计划 S1、S2）。P1 Workflow 合并与纯文本模式不在本次实施范围。

## 冻结基线

[机器可读基线](tooling-baseline.json)固定 Maker/runtime 版本、归档 hash、模型配置、历史知识版本和最终卡带 hash。复算：

```sh
node app/scripts/evaluation/freeze-tooling-baseline.mjs --check
```

| 案例 | 去重调用 | 观察 | 单行观察 | 工具错误 | 文本 UTF-8 bytes | 图像 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sweet Garden | 176 | 88 | 68 | 2 | 267300 | 119 |
| Lodge Podge | 157 | 27 | 0 | 10 | 238988 | 215 |

每轮归档包含此前轮次的完整历史，不能将各轮 `entries` 直接相加。指标使用 tool-call ID 去重，结果按 toolCallId 关联；没有返回值的调用单独计 missingResults，不算成功。字符数与 UTF-8 bytes 分开记录。首个成功 load 仅代表启动；核心循环和正常胜利需要独立证据，不能从工具名称或最终回复推断。独立案例证据文件另有 hash，未由本脚本重新执行，因此覆盖字段保留 unknown。

新指标已作为 `transcriptMetrics().outcomes` 接入两个现有评测入口。旧 skill 检查标为 `legacy-skill-routing`；它们仍描述当前按需 skill 实现，不作为 P0 改善结论。

## 已核对的运行时边界

播放器 `p8w_frame_runtime.cpp` 的 `at_menu_boundary` 已处理两种执行方式：callback 模式需无 active callback；custom-loop 保留暂停于帧边界的 TopLevel coroutine，不能覆盖/释放该 root。两者均排除 pending host request / WAITING_HOST。

S2 查询与调试必须复用这种边界检查。调试使用独立受保护执行线程，并保存、恢复 root 与预算状态；不允许在 guest host suspension 中插入执行。此处是实现约束，尚未实现或验证调试 API。

目标接口与限额以[实施计划](agent-tooling-plan.md)的架构与接口决策为准；S2 在播放器公开类型/ABI 落地后由代码成为权威定义，避免维护两套常量。

## 关键 fixture 与验收

- 指标：累计历史重复、缺失结果、失败结果、Unicode bytes、PNG 尺寸、无证据不推断通关。
- 观察：真实 WASM 配色帧、边缘交集、无交集拒绝、×4 像素块、ASCII 与原始 frame 不变。
- 输入：held/tap、末帧与 checkpoint 去重、非法请求零执行、部分 stop。
- 查询/调试：callback/custom-loop、带副作用元方法、循环/稀疏 table、超限、异常后 reset、禁用 host 操作、日志洪泛、旧 Worker 迟到响应。
- 隔离：debug 不改源码/导出/实时试玩，fresh reset 清内存存档，记录状态不会误转 normal。

## 当前进度与验证

基线和评测指标已落地；S0 的 runtime 类型/ABI 契约落地与 P0 实现仍在进行。

已通过 `outcome-metrics.test.mjs` 与 `skills-evaluation.test.mjs` 的 9 项定向测试，其中已有小机制 oracle 使用真实 WASM；冻结基线重算一致。未运行完整回归或付费模型评测。

P0 观察切片已实现：模型运行/资源 PNG 共享 ×4 最近邻出口，裁剪取屏幕交集；原生帧、ASCII 和 UI 数据保持原尺寸。观察测试 7 项通过，资源预览与 Harness 图像交付 2 项通过。输入契约、结果 DTO 与 runtime 查询/调试/日志仍待完成，不能视为 P0 完成。

P0 输入切片已实现：唯一 steps schema、删除 captureFrames/replay 路由、版本 2 输入记录、normal 默认目的，以及每次 load/reset 创建新 session。第一方调用者与模型文档已更新。26 项工具/评测/实际 Worker 测试通过，覆盖 tap、held、部分 stop/fault、非法输入零执行、记录持久化和存档清零。旧记录不转换，卡带内容保留。结果 DTO 与 runtime 查询/调试/日志仍待完成。

输入集成后的知识/对话工具注册/源码工作区/卡带存储/UI 分组定向检查另 31 项通过。未扩大到完整回归；生产构建安排在 runtime 与 Maker 集成完成后运行。
