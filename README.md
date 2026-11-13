# PICO-8 Maker

在浏览器里用对话创作 PICO-8 游戏。首页可试玩社区卡带，工作台提供独立的对话、Lua 源码、资源预览和真实 WASM 试玩。完成后可导出 `.p8` 卡带。

## 本地运行

应用使用 Node.js 24。只需克隆本仓库并安装应用依赖，无需检出播放器源码或安装 Emscripten。启动、测试和构建会按 `app/player.lock.json` 从 [播放器静态站点](https://boxuechen.github.io/pico8-web-player/) 下载固定构建，验证文件完整性并缓存在 `app/public/player/`；缓存完整时不访问网络。
```sh
npm --prefix app ci
npm --prefix app run dev -- --host 127.0.0.1 --port 5175
```

打开 http://localhost:5175 。开发、测试和构建都会准备播放器与版本化知识文件。模型设置与卡带按浏览器来源保存，继续已有项目时请使用原来的主机名和端口。

在首页输入游戏想法并创建卡带。首次发送时选择模型，可用 **Test connection** 检查图像与工具调用能力。Agent 修改草稿并通过试玩反馈迭代。右侧时间轴显示关键帧，**STOP** 停止当前请求，**SAVE CART** 导出最近提交的版本。

## 项目结构

- `app/src/` 包含 React 工作台、Pi Durable Agent 和 PICO-8 工具。用户试玩与 Agent 测试使用独立运行时。
- `app/src/assets/carts/` 保存首页实际展示的 11 张社区卡带。构建将原始字节内嵌到应用首页，`carts.json` 保留作者和来源。
- `docs/pico8-agent/` 提供模型规则、启动时注入的统一 Workflow、按需参考和可运行示例。见[知识库与宿主契约](docs/pico8-agent/README.md)。
- `app/evaluation.html` 提供本地真实模型评测。见[评测与案例复现](app/scripts/evaluation/README.md)。

每张卡带共享源码、原生资源和最近 12 个版本，支持多个独立对话。卡带与对话存入 IndexedDB。模型配置默认保存在浏览器，可关闭保存或清除配置。应用直接请求所选服务，交互模型默认采用 medium 思考设置并按能力调整。

当前能力、验证边界与后续工作见[开发状态](docs/development-status.md)。模型已支持状态查询、有界调试和日志；真实模型与 128/512 图像对照尚未完成有效验证，纯文本模式待实现。

## 检查与构建

```sh
npm --prefix app test
npm --prefix app run build
npm --prefix app run test:sites
```

`npm --prefix app run test:model` 启动联调用的模拟接口 `http://127.0.0.1:8788/v1`。在自定义模型配置中选择 `fixture-tools`，填写任意非空测试 Key。普通回归测试使用模拟响应和实际 WASM。

静态发布使用 `app/dist/client/`。Sites 构建还生成 `app/dist/server/index.js` 和 `app/dist/.openai/hosting.json`。

## 文件维护

源码、模型知识、示例校验凭据与可复现案例入库；构建输出、依赖和详细实验记录保持忽略。`app/dist/`、`app/public/player/`、`app/public/extensions/pico8/` 和 `app/src/generated/` 可通过构建重新生成。`ref/` 与 `.cache/emsdk/` 仅用于可选的底层联调，不参与默认构建；`.cache/evaluations/` 包含未入库的原始评测证据，不应当作普通临时缓存清空。过期计划和阶段流水账通过 Git 历史追溯，不再平行维护。

## 播放器依赖

播放器作为静态组件维护在 [pico8-web-player](https://github.com/boxuechen/pico8-web-player)，不依赖独立的 C++ `pico8-runtime` 仓库。Maker 从 Pages 下载完整 JS/WASM、Worker、CSS 和许可文件，打包到自己的站点；用户运行游戏时不跨域加载播放器。

更新播放器时，在播放器仓库提交源码并运行 `pnpm run publish:pages`，然后更新 `app/player.lock.json` 的静态目录、源码 commit 和 `manifest.json` SHA-256，运行 Maker 测试及构建。静态站点保留已发布的 commit 目录，不需要 GitHub Release。

需要同时修改播放器时，可以显式传入本地构建目录：

```sh
PICO8_PLAYER_DIR=/absolute/path/to/pico8-web-player/apps/web-player/dist/release npm --prefix app run dev
```

本地覆盖仍校验构建 manifest，但不要求匹配锁定版本。取消该环境变量后，准备脚本会恢复锁定构建。
