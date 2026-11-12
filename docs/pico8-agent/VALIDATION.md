# 示例验证记录

执行日期：2026-11-12。命令：`node docs/pico8-agent/recipes/verify.mjs`。机器可读证据：[validation-results.json](validation-results.json)。源代码和运行产物哈希记录在该文件中。

## 验证范围

- 五个原始 Lua 文件分别加载并运行 120 帧；再包装为 `.p8` 重新加载并各运行 120 帧。无素材段依赖，未出现 runtime diagnostics。
- Sprite：透明角透出背景，主体/眼睛颜色正确；两帧脚部变化；按右键后移动且旧位置恢复背景。
- Map：向墙移动被阻挡；相同输入顺序到达金币，地图 tile 清空、计数增加，墙仍存在。
- SFX：音高/音量/speed 字节正确；生成实际非静音 PCM；X 在通道 3 重播。
- Music：pattern 字节包含正确起止循环标志与禁用通道位；实际序列包含 0→1→0；X 触发通道 3 的 SFX 4 时音乐通道 0/1 保持；产生非静音 PCM。
- 存档：当前局重试不清 best；同实例 native reset 与重新 loadSource 后保留；新 memory 实例隔离；schema 0 迁移保留旧 best；未来 schema 9 不被旧代码覆写。
- Palette：低 nibble 在左，高 nibble 在右；扩展显示映射 8→136 后 RGBA 与文字表对应的 RGB 相等。
- 文档：32 色数据与 runtime 一致；PALETTE 镜像一致；API 目录覆盖本地 inventory 的全部 113 条；内部文件链接有效。

## 证据边界

这是独立样例与数据协议验证，不是网页模型实际创作验收。没有修改应用、向模型发请求或接入新工具。普通样例测试使用当前公开 session release；音频细节测试使用同 checkout 构建的低层 FrameSliceRuntime + z8lua，记录实际 PCM，不模拟音频 API。

未进行主观听感评审，也未在浏览器验证 IndexedDB 跨刷新存档、真实设备出声或用户试玩 UI。文档不能将这些写成已通过。页面上的模型仍只有现有观察能力。
