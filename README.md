# PICO-8 AI Demo

暗色 assistant-ui 聊天 + PICO-8 像素外壳 + 真实 WASM 播放器。最小实现位于 `app/`。

## 本地启动

当前工作区已经构建播放器。使用 Node 24：

```sh
cd app
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

打开 http://127.0.0.1:5173 。不填写 Key 也能试玩预置游戏。首次运行另一个全新 checkout，需要先按 `ref/pico8-web-player/docs/development.md` 构建播放器 release；本项目的 predev/prebuild 会复制完整 release。

本次使用项目内 `.cache/emsdk` 安装固定 Emscripten 6.0.5，并用 Node 22.22.2、pnpm 10.8.0 构建播放器，没有替换机器上的全局工具链。播放器来源提交：`43d3ef7`。

## 演示

1. 点击像素游戏机的播放按钮。方向键移动，X/Z 跳跃。初始示例确实无法跳过墙。
2. 点击“模型设置”，默认已选 DeepSeek → DeepSeek V4.1 Flash（`deepseek-flash`），只需填写 DeepSeek API Key。也可从 Pi 的 OpenRouter 目录选择支持图片输入的 Chat Completions 模型，或使用自定义接口。目录能力并不代表服务账号已开通；接口仍需允许页面来源的 CORS 请求。
3. 点击“测试连接”：使用与 Agent 相同的 Pi 流式适配器发出两次小型请求，验证图片识别、结构化工具调用、带截图的工具结果回传。通过后保存，发送“角色跳不过这堵墙，帮我修复”。
4. Agent 读取源码、修改、在独立会话中测试，并把真实画面返回模型；工具记录在聊天内可展开。
5. 测试期间右侧显示真实测试帧。点击“停止生成”可取消；完成后点击播放亲自试玩。
6. 右上角更多菜单支持撤销上次源码修改、查看 Lua、导出 `.p8`。

## 复用关系

- `@assistant-ui/react`：Thread / Message / Composer / ActionBar primitives、ExternalStoreRuntime；Markdown 使用其现成组件。
- Pi Durable 1.5.2：真实 Harness、工具调度与模型请求；以自定义适配器映射到 assistant-ui。
- `pico8-web-player`：完整 standalone release。实时试玩使用 WebPlayer 的 Worker 执行；AI 手动步进使用独立 Worker 内的 `createPico8Session`。
- `design/simple-demo/`：当前设计目标；像素机壳图片放在 `app/public/assets/`。

游戏工具：`read_game`、`load_game`、`reset_game`、`press_buttons`、`observe_game`。截图将实际 RGBA 编码成 PNG image content 交给模型。修改先编译并执行一帧，通过后才替换用户游戏。模型调用最多 24 轮；每次输入 1–120 帧；测试 Worker 超时会被终止。

## 存储与范围

- 默认 Key 只在页面内存；只有用户勾选“记住配置”时才写入本机 localStorage。没有业务后端，也不内置服务密钥。
- 最近 12 个源码版本保存在本机，可撤销；当前对话使用 Durable MemoryStorage，刷新会清空对话，不恢复正在执行的 Agent 任务。
- 首版通过 Lua 绘图函数创作，未做 sprite/map/music 素材编辑、通用变量调试或自动测试判定器。模型依据实际截图与错误判断结果。DeepSeek 复用 Pi 的兼容参数，演示默认关闭思考模式，每次输出上限 12K tokens；模型请求超时 120 秒，连接测试总超时 60 秒。
- “模型已配置”只表示保存了配置，不能代表已验证视觉和工具能力。
- 运行目标为桌面 Chrome/Chromium；窄屏能查看布局，但首版游戏控制以键盘为主。

## 验证

```sh
cd app
npm test
npm run build
npm run test:sites
```

模型适配测试覆盖 Pi 目录元数据、DeepSeek 请求参数、流式工具参数拼接、截图回传、认证失败不重试，以及禁止文字回复冒充工具能力通过。

真实 WASM 测试覆盖：固定操作修改前失败、修改后越墙落地；语法错误及重新加载；无限循环的指令预算。

`npm run test:model` 可启动 **仅用于联调的模拟模型接口**（127.0.0.1:8788/v1）。模型名 `fixture-tools` 会发出预定工具调用，`fixture-error` 返回 401，`fixture-slow` 延迟响应以测试停止；填任意非空测试 Key，不要使用真实密钥。该接口不进行 AI 推理，不是正常应用的 fallback，应用也不会自动连接它。浏览器联调验证了工具链、停止、错误反馈、撤销和导出。该模拟接口仅用于本地回归。2026-11-12 已用用户在页面内填写的 DeepSeek 配置完成真实模型测试，见下文。

静态发布目录为 `app/dist/client/`，可部署 GitHub Pages。无需部署模板附带的 `dist/server`；默认使用相对资源路径。必须通过 HTTP(S) 访问，不支持双击 file://。

DeepSeek 型号与能力核对来源：[官方模型说明](https://api-docs.deepseek.com/quick_start/pricing/)、[图片输入](https://api-docs.deepseek.com/guides/vision/)、[工具调用](https://api-docs.deepseek.com/guides/tool_calls/)，核对日期 2026-11-12。未提交或内置任何真实密钥。

## 真实模型验收（2026-11-12）

- 模型：Pi 目录中的 DeepSeek V4.1 Flash / `deepseek-flash`，官方直连接口。
- 浏览器实际执行了 13 次游戏工具调用，包含全部 5 种工具；读取代码、复现问题、修改、重测均由真实模型驱动。
- 同一真实服务的两轮连接自检通过：流式回复、颜色图片识别、工具调用、带图片的工具结果回传均正常。无密钥的 CORS 预检也通过。
- 导出本次真实模型修改的卡带到 `app/qa/deepseek-fixed.p8`，独立 WASM 复测：相同输入下，修改前角色停在 `(58,100)`；修改后到达 `(109,100)` 并落地；墙仍为 `(66,80,12,28)`。
- 证据：`app/qa/deepseek-live.png`、`app/qa/deepseek-live-result.json`。这些文件不含 API Key。
- 单次示例通过证明了链路可用，不代表模型每次生成都能成功；继续迭代仍以真实运行结果为准。
