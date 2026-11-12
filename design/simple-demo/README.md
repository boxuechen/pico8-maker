# 简化 Demo（当前方向）

本方案替代此前 design/demo-flow 的复杂状态稿。

- 主体直接使用 assistant-ui 的 Thread、Composer、默认消息和折叠工具记录。
- 右侧嵌入 pico8-web-player；仅为播放器增加用户提供的 PICO-8 像素外壳。
- 保持黑色正方形游戏窗口、像素边缘和彩色播放图标，运行时填入真正的游戏 Canvas。
- 主界面只保留聊天、播放器和模型设置入口。声音、全屏复用播放器能力。
- API Key、Base URL、模型在设置弹窗填写。
- AI 操作与结果显示在聊天内，避免额外流程面板、仪表盘和版本对比区域。
- 原目标中的撤销和导出可通过聊天操作或紧凑菜单提供，不新增常驻面板。

[简化稿](./mockup.png) · [用户提供的外壳参考](./pico8-shell-reference.png)

本图使用内置 Image Gen，实际附加了 assistant-ui 仓库截图与用户外壳参考。它是视觉稿，尚未实现运行界面；生成提示词见 [prompt.md](./prompt.md)。
