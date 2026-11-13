# 来源、版本与维护

资料核对日期为 2026-11-12。网页 Agent 使用 manifest 发布的资料。示例验证范围见[资源与存档示例](recipes/README.md)和[完整小游戏](games/README.md)。

## 语义来源

[PICO-8 官方手册](https://www.lexaloffle.com/dl/docs/pico-8_manual.html)，读取时标题为 v0.2.7。用来核对 Lua 语义、程序结构和 API 分类。本资料使用原创说明与样例，不复制手册正文或 editor 教程。函数签名、内存布局等事实还逐项对照下列本地实现和测试。

本地播放器 checkout：`96e19b904b1c4d6dade453351adb4272484c4896`。验证报告记录实际 release JS、WASM 和合成器产物 SHA-256；更换播放器后重新运行样例，不仅更新这个提交号。

## 本地依据

| 资料主题 | 实现 / 契约 | 对应测试 |
| --- | --- | --- |
| 完整 API 清单 | [inventory](../../ref/pico8-web-player/spec/pico-api-inventory.yaml)、[host ABI](../../ref/pico8-web-player/spec/abi/pico-host-api-v1.json) | 每条 API 目录中的 evidence |
| 机器/帧 | [Frame runtime](../../ref/pico8-web-player/packages/runtime-core/src/frame-runtime.ts)、[独立 session](../../ref/pico8-web-player/docs/standalone-session.md) | [session 测试](../../ref/pico8-web-player/tests/runtime/standalone-session.test.mjs) |
| RGB / 帧解码 | [pico-frame.ts](../../ref/pico8-web-player/apps/web-player/src/runtime/pico-frame.ts) | 本资料 verify 的默认/扩展色与 packed pixel 检查 |
| 绘图 / sprite | [graphics](../../ref/pico8-web-player/packages/runtime-core/src/graphics/l1-graphics.ts) | [sprites](../../ref/pico8-web-player/tests/runtime/sprites.test.mjs)、[draw-state](../../ref/pico8-web-player/tests/runtime/draw-state.test.mjs) |
| Map | [map-memory](../../ref/pico8-web-player/packages/runtime-core/src/graphics/map-memory.ts) | [map-tline](../../ref/pico8-web-player/tests/runtime/map-tline.test.mjs) |
| Lua/数学 | [API inventory](../../ref/pico8-web-player/spec/pico-api-inventory.yaml) 中 vm-builtin 及 lua-global | [Lua 标准库](../../ref/pico8-web-player/tests/runtime/lua-standard-library.test.mjs)、[核心库](../../ref/pico8-web-player/tests/runtime/core-library.test.mjs) |
| 音频 | [SFX synth](../../ref/pico8-web-player/packages/runtime-core/src/audio/sfx-synth.ts)、[host API](../../ref/pico8-web-player/packages/runtime-core/src/pico-api/pico-api-host.ts) | [music-audio](../../ref/pico8-web-player/tests/runtime/music-audio.test.mjs) |
| 内存 / cartdata | [RAM](../../ref/pico8-web-player/packages/runtime-core/src/memory/pico-ram.ts)、[session 契约](../../ref/pico8-web-player/docs/standalone-session.md) | [memory ABI](../../ref/pico8-web-player/tests/runtime/memory-abi.test.mjs)、[cartdata](../../ref/pico8-web-player/tests/runtime/cartdata.test.mjs) |
| 输入 | [host API](../../ref/pico8-web-player/packages/runtime-core/src/pico-api/pico-api-host.ts) | [controller-input](../../ref/pico8-web-player/tests/runtime/controller-input.test.mjs) |

引用的上游测试并非本轮全部重跑；本轮执行的是本资料自己的五个 recipe 与行为验证。实现清单与实际产物可能随开发变化，因此维护时检查源码和已构建 release 的一致性。

## 维护规则

- 颜色的规范数据放 palette.json；PALETTE.md 是文字镜像，校验同时检查两者与 runtime 相等。中文/英文名称是产品标签。
- MACHINE 保持短小；细节写专题参考，REFERENCE_INDEX 提供入口。新增 API 类别不能只改提示词而忘记资料索引。
- 修改 recipe 后重跑 `node docs/pico8-agent/recipes/verify.mjs`；失败不得把 report 日期手动改成“通过”。
- 新增复杂 API 模式，先写独立可执行例子与相关验证，再提升为已验证用法。API 目录从 inventory 逐条生成，不把 implementation 状态擅自改成 compatibility 承诺。
- 官方事实、本地语义、宿主工具能力分开标注。宿主观测不足不代表没有对应游戏 API。
- 参考链接供维护者追溯来源。模型通过 `/extensions/pico8/` 读取已发布的资料。
