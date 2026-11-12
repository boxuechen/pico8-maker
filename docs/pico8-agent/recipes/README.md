# 可独立加载的创作示例

每个 `.lua` 都包含 `_init/_update60/_draw`，无外部 include、素材文件或 editor 步骤。它们是小型创作范例，不是完整商业游戏。公共 helper 在各文件重复是为了保持每个文件独立可用；合并到一个项目时只保留一份并规划资源编号。

| 文件 | 资源布局 | 使用方式 |
| --- | --- | --- |
| [sprite-from-rows.lua](sprite-from-rows.lua) | sprite 1/2；透明色 0；两帧角色 | 方向键移动，约每 20 次更新切帧 |
| [map-from-rows.lua](map-from-rows.lua) | sprite 1 墙 / 2 金币；map 16×8；flag 0 solid / 1 collectible | 方向键逐格移动；墙阻挡，金币增加计数 |
| [sfx-from-notes.lua](sfx-from-notes.lua) | SFX 0，通道 3 | 初始提示音，X 重播 |
| [music-from-patterns.lua](music-from-patterns.lua) | SFX 0–3 音乐，4 提示音；pattern 0/1；通道 0/1 与 3 | 两个 pattern 循环；X 播提示音 |
| [save-high-score.lua](save-high-score.lua) | cartdata 槽 0 schema，1 best；其他槽保留 | X 加分；O 新开一局；存档 ID 复制成独立游戏时改一次 |

所有样例使用默认 16 色；像素行解释见 [PALETTE](../PALETTE.md)。音频 helper 目前覆盖普通波形、音量、效果和无循环基础 SFX；自定义乐器/filter 需按参考另行扩展。

验证命令，从项目根目录执行：

```sh
node docs/pico8-agent/recipes/verify.mjs
```

脚本依赖当前工作区已有的播放器 release 与 ref 的 runtime/WASM 构建产物。缺失时按 [播放器开发说明](../../../ref/pico8-web-player/docs/development.md) 构建；脚本不会下载新依赖、修改应用或写用户浏览器存档。

五个样例先分别在公开 manual session 上运行，再包装成纯 Lua `.p8` 重新加载，证明不依赖素材段。行为测试还检查像素、按键、资源 RAM、PCM、音乐 pattern 和 memory 存档生命周期。验证用的 Lua 断言和低层 RAM 读取仅属于开发侧测试，不是新的网页模型工具。

脚本成功后写出 [validation-results.json](../validation-results.json)，包含源码哈希、产物哈希和具体检查。知识库编译会检查回执与 Lua 源码的哈希是否一致。
