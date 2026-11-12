# PICO-8 AI Demo

PICO-8 官网风格创作首页 + assistant-ui 双栏聊天工作台 + 真实 WASM 播放器。最小实现位于 `app/`。

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
2. 点击输入框底部的“Connect model”或当前模型名称，默认已选 DeepSeek → DeepSeek V4.1 Flash（`deepseek-flash`）。可选 OpenAI、Anthropic、Gemini、Qwen、OpenRouter 等 26 个服务入口，模型来自已安装的 Pi 目录，并按原生协议调用；也可使用自定义 OpenAI 兼容接口。目录能力并不代表服务账号已开通；接口仍需允许页面来源的 CORS 请求。
3. 点击“测试连接”：使用与 Agent 相同的 Pi 流式适配器发出两次小型请求，验证图片识别、结构化工具调用、带截图的工具结果回传。通过后保存，发送“角色跳不过这堵墙，帮我修复”。
4. Agent 读取源码、修改、在独立会话中测试，并把真实画面返回模型；工具记录在聊天内可展开。
5. 测试期间右侧显示真实测试帧。点击“停止生成”可取消；完成后点击播放亲自试玩。
6. 右上角更多菜单支持撤销上次源码修改、查看 Lua、导出 `.p8`。

## 复用关系

- `@assistant-ui/react`：Thread / Message / Composer / ActionBar primitives、ExternalStoreRuntime；Markdown 使用其现成组件。
- Pi Durable 1.5.2：真实 Harness、工具调度与模型请求；以自定义适配器映射到 assistant-ui。
- `pico8-web-player`：完整 standalone release。实时试玩使用 WebPlayer 的 Worker 执行；AI 手动步进使用独立 Worker 内的 `createPico8Session`。
- `design/simple-demo/`：当前设计目标；像素机壳图片放在 `app/public/assets/`。

游戏工具：`read_game`、`load_game`、`reset_game`、`press_buttons`、`observe_game`；知识工具：`read_reference`。截图将实际 RGBA 编码成 PNG image content 交给模型。修改先编译并执行一帧，通过后才替换用户游戏。模型调用最多 24 轮；每次输入 1–120 帧；测试 Worker 超时会被终止。

## 存储与范围

- 按用户要求，默认将所选模型、接口与 API Key 保存到当前浏览器 localStorage，刷新后恢复。可取消 Remember settings 使用内存模式，或用 Clear saved settings 清除本机模型配置（保留游戏与聊天）。没有业务后端，不内置服务密钥，请求直接发送到所选模型服务。不同站点/端口的浏览器存储彼此独立。
- 最近 12 个源码版本保存在本机，可撤销；当前项目的对话、输入草稿和最近 12 个源码版本一起保存在本机。刷新会恢复模型可读的历史和当前卡带；不自动恢复正在执行的任务。历史截图用文字占位，待验证时重新观察游戏。
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

## 创作首页与工作台（2026-11-12）

- 首页使用官方 Proggy 网页字体、PICO-8 标识、已有像素机壳和十四张真实社区 `.p8.png` 卡带；来源与作者记录在 `app/src/assets/carts.json`。卡带保留原始字节，经 Vite 插件内置于 HTML，点击直接在本地播放器运行；作者署名链接指向官网。下载用于本地参考展示，不代表取得社区作品或品牌素材的再授权。
- 输入想法后点击 MAKE，未配置时打开模型设置，取消保留草稿，保存后只提交一次并进入工作台。工作台左右分栏可拖动，也可聚焦分隔线后用左右方向键调整。窄屏为上方预览、下方聊天。
- 卡带存储见下方“多卡带存储与卡带架”。存储失败会显示提示，不宣称保存成功。Key 配置仍使用独立的显式 opt-in 存储。
- 恢复时把历史作为被动记录写入真正的 Pi 模型上下文，未完成工具调用补充中断结果，不重放工具。对话保留工具文字记录，移除大体积截图和思考内容。
- 模型请求结束后即可试玩；仅通过编译和运行验证的新源码才更新预览。游戏键盘输入由播放器焦点管理，聊天输入不控制游戏。
- 验证覆盖真实 WASM、模型适配、历史导入/中断恢复/存储失败；浏览器联调使用明确标记的本地模拟服务，不冒充真实模型生成。

首页播放器使用官网 `https://www.lexaloffle.com/gfx/p8tv_header.png` 原始横幅作为像素外壳及背景、网页内嵌像素播放图标；开机扫描动画按官网实测的竖向彩色点阵 → 横向扫描 → 黑屏过程重现，不加载官网的运行时。社区卡带经过本项目真实 WASM 的加载和 120 帧运行验证。首页试玩与项目源码独立；进入工作台前恢复原项目，试玩不会覆写源码历史。

## 工作台 BBS 风格迭代（2026-11-12）

- 工作台统一 Proggy 英文字体、中文回退字体、英文界面文案；聊天改为左对齐的 YOU / PICO MAKER 帖子和细分隔线。默认左右比例为 42 / 58，可拖动或键盘调整。
- 浅奶油色输入框使用深色文字、粉色 SEND / STOP；保留 assistant-ui 原有换行、输入法与取消行为。
- 一次用户请求中的多轮 AI 工具调用合并到同一回复，工具区运行时展开、结束时收起。明细区区分完成、失败、中断，恢复时的未完成工具也显示中断；执行完成不等于游戏验收通过。原始模型历史、工具执行与截图观察流程保持不变。
- 验证：15 项应用测试、4 项 Sites 测试及生产构建通过；浏览器使用本地模拟模型完成 11 步真实 WASM 联调，检查分组展开/收起、桌面与窄屏布局、分隔线键盘调整、刷新恢复、继续试玩和 STOP。此次未重新调用真实模型。截图：`app/qa/pico-maker-workbench.jpg`。
- 本轮不包含 Preview / Code 页签或版本列表，这些保留到后续迭代。

## 工作台统一配色与左右消息布局（2026-11-12，替代上述 BBS 视觉）

- 页面、顶部栏、聊天和预览统一为 `#11141D`；用户气泡与输入框共用 `#1E222D`。移除角色标签、头像及帖子分隔线，恢复用户靠右、AI 靠左的聊天结构，保留 Proggy 字体与工具分组。输入框默认两行，历史回复操作按 assistant-ui 默认策略显示。
- 默认聊天 / 预览比例为 55 / 45，可在 35%–65% 之间调整。机壳上限 360px，桌面游戏画面为 256×256；全屏仍可放大。工作台通过 CSS 沿官网机壳像素轮廓裁切横幅，消除自带背景与地面的色块，原始图片和首页保持不变。
- 验证：15 项应用测试、4 项 Sites 测试及构建通过；浏览器检查 1440×900 与 390×844 布局、背景计算颜色、工具展开/收起、分栏键盘调整、Shift+Enter 换行、手动试玩和全屏。预览沿用之前的模拟模型会话，此轮未发起模型请求。截图：`app/qa/pico-maker-workbench-unified.jpg`。

工作台预览继续收窄为 38%（聊天 62%，拖动范围 35%–72%），窄屏预览占高 34%。桌面仍保留 360px 机壳 / 256×256 游戏画面。首页与工作台共用 `player-shell.css`：控制按钮竖排嵌在机壳右侧，底部为小号 Proggy 操作提示，取消工作台独有的下方横排工具栏；控件随机壳定位，全屏仍可用。构建与 4 项 Sites 测试通过，浏览器检查首页切换、播放/暂停、全屏和 390×844 窄屏布局；此次未发起模型请求。截图：`app/qa/pico-maker-workbench-compact.jpg`。

预览尺寸调整：默认分栏改为聊天 58% / 预览 42%，桌面机壳上限 540px，游戏画面上限 384×384（原始分辨率 3 倍）；播放器靠上排列。宽度或高度不足时自动缩小，窄屏继续沿用紧凑布局。浏览器实测 1440×900 下画面为 384×384，1280×720 下完整显示且不横向溢出；生产构建与 4 项 Sites 测试通过。截图：`app/qa/pico-maker-workbench-384.jpg`。

工作台标题归位：顶栏左侧只保留可返回首页的像素图标，完整品牌文字保留在首页；会话标题移至聊天区上方，替换 Chat。旧会话从首条用户消息恢复完整显示标题，避免原先 24 字符截断；窄屏使用省略号，title 提示保留全文。构建及 4 项 Sites 测试通过，浏览器验证返回首页、继续会话、桌面标题和窄屏无横向溢出。截图：`app/qa/pico-maker-workbench-title.jpg`。

### 模型入口与本地保存（2026-11-12）

模型设置移到首页与工作台输入框底部。原生适配器覆盖 Chat Completions、Responses、Anthropic Messages、Gemini 与 Mistral；保留 Pi 模型元数据、图片观察、工具回传、超时和取消。目录只展示这些协议中声明支持图片输入的模型，工具调用能力需通过 Test connection 或实际任务确认；尚未对新增服务逐一做付费账号实测。OAuth、AWS/Vertex 等依赖服务端身份的接入不混入普通 API Key 列表。

Qwen 普通百炼与 Token Plan 分开，并区分中国/国际入口。普通入口使用官方仍支持的 DashScope 地域域名；需要业务空间专属地址时使用 Custom compatible API。模型是否在账号地域开放以百炼控制台为准。依据：[百炼 OpenAI 兼容接口与地域说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)。

验证：真实 Pi 适配器的请求地址、认证头、图片和工具 schema 经过受控网络测试；默认保存、取消保存与清除配置有自动化覆盖。浏览器使用测试字符串验证刷新恢复、切换服务清空密钥、清除配置后聊天/游戏保留；测试配置已清除。

本轮 23 项应用测试、4 项 Sites 测试与生产构建通过；桌面 1440×900 和窄屏 390×844 完成 UI 检查。截图：`app/qa/pico-maker-composer-model.jpg`、`app/qa/pico-maker-model-settings.jpg`。

工作台页头调整（2026-11-12）：首页与工作台使用独立的 HomeHeader / WorkbenchHeader 组件。工作台标题移到顶部图标旁的 52px 导航行，移除聊天区重复标题栏；长标题视觉省略并保留完整 tooltip。底层会话与播放器保持共享，切换保留草稿和游戏。生产构建、23 项应用测试通过，桌面与手机布局及页面往返已验证。截图：`app/qa/pico-maker-workbench-header.jpg`。

### PICO-8 knowledge integration

模型可见的[知识包](docs/pico8-agent/README.md)采用英文，回复仍跟随用户语言。`pico8` extension 常驻创作规则、机器定义、16 色文字表、参考索引、宿主能力和知识版本；`read_reference` 按 ID 返回 27 份指南、完整 Lua 示例或 API 分类参考。已移除旧的固定跳墙任务及只用基本图形的提示词。美术、音频、存储示例通过 Lua 初始化，可随源码一起导出。

在 `app` 中执行 `npm run prepare:knowledge` 生成知识模块；dev、build、test 自动生成。构建检查英文内容、示例验证哈希和工具输出大小，知识输出携带版本及 SHA-256。修改源文档，不要编辑生成文件。

本轮验证：25 项应用测试、15 项知识示例检查、4 项 Sites 测试及生产构建通过。历史恢复使用真实 Pi 适配器和模拟模型响应检查请求内容：新 sections 替换旧提示词，读取资料的工具记录保留，游戏操作不重放。本轮未调用真实模型服务。观察仍为 PNG，ASCII 后续接入。

### Cropped ASCII observation

`observe_game({})` 仍返回完整 PNG。新增 `format: "ascii" | "png" | "both"` 和可选 `region: {x,y,width,height}`；区域使用左上角起点的屏幕像素坐标，越界报错，省略则读取完整 128×128。ASCII 每字符对应一像素，用 0–f 表示屏幕颜色槽，并附完整的当前帧调色板英文颜色名、RGB 和显示色编号（含扩展色）。`both` 从同一个快照生成同区域文字与 PNG，观察不会推进帧。

像素编码与裁剪位于 `app/src/pico8/observation.js`；调色板模块由知识包的 `palette.json` 同源生成。常驻规则和 `guide/playtest` 引导模型默认用 PNG 看整体、按需用局部 ASCII 核对像素。完整字符矩阵使用独立的 32 KiB / 256 行预算，大量诊断会明确标记缩减，矩阵不会被静默截断。历史保留 ASCII 及 session/generation/revision/frame 标识；恢复历史不会恢复游戏运行状态或重放操作。

验证：32 项应用测试、15 项示例检查、4 项 Sites 测试及生产构建通过。真实 WASM 覆盖默认/扩展色、绘图与显示映射、重复颜色、奇数列和边缘裁剪，并逐像素还原 RGBA；真实 Pi 适配器使用模拟响应验证完整矩阵、裁剪和历史恢复。浏览器另用 `fixture-observation` 本地模型联调，确认实际 PNG 为 7×5 裁剪或默认 128×128，刷新后裁剪矩阵与调色板记录保留。本轮没有调用真实模型。

## PICO-8 Maker 视觉改版（2026-11-12）

产品统一命名为 PICO-8 Maker。样式重组为 `base.css`（设计变量、播放器、输入框、弹窗）、`home.css`、`workbench.css`，播放器机壳样式 `player-shell.css` 保持官网还原不变；删除旧的多层覆盖 `demo.css`。

- 首页：官网横幅构图，左侧官方 logo + MAKER + 6 张卡带，右侧 YOUR CART（用户卡带及其试玩截图标签）+ 5 张卡带 + MORE CARTS；署名改为悬停提示；输入框紧贴电视下方；新增 How it works 与规格页脚。
- 工作台：顶栏常驻版本号、近似 token / 字符用量（`src/pico8/tokens.js`）、Preview/Code 切换、撤销与 SAVE CART；导出的 `.p8` 带 `__label__`（取最近一帧 AI 试玩画面，`src/pico8/cart.js`）。工具记录合并为单张进度卡；成功修改后出现版本卡；预览区新增状态徽章、测试进度条与“Playtest frames”时间轴。修复了中断提示在新任务运行时仍显示的问题。
- token 数按手册规则近似统计，可能与 PICO-8 编辑器显示略有差异；字符上限按 65535 显示。

## 多卡带存储与卡带架（2026-11-12）

纯静态页面，没有也不会有服务器；所有卡带只保存在当前浏览器。

- 存储改为 IndexedDB（`src/cart-store.js`，库名 `pico8-maker`，`carts` 存每张卡带的对话、源码版本、版本号、标签和草稿，`meta` 存当前卡带与是否在工作台）。不做旧版单项目 localStorage 数据的迁移与兼容。浏览器不允许 IndexedDB 时退回内存模式，并在卡带架上提示关闭标签页即丢失。首次创作时请求 `navigator.storage.persist()` 降低被浏览器清理的概率。
- 首页新增「My carts」卡带架：CONTINUE / 保存 .p8 / 复制 / 删除（二次确认），状态点区分 SAVED 与 NOT SAVED YET，顶部常驻“只存在本浏览器”提示。右上角改为 LAST CART（最近修改的一张）。
- 首页输入新想法一律新建卡带（按钮显示 MAKE NEW CART），旧卡带不会被修改；工作台内发送仍继续当前卡带。只打开或输入草稿不会改变排序。
- 切换卡带时播放器不重启，聊天 Agent 按卡带重建，旧 Agent 的迟到更新会被丢弃。
- 多个标签页同时编辑同一张卡带时以最后写入为准。

## 卡带工作区与局部修改（2026-11-12）

- Agent 在一个单文件虚拟工作区里工作：`/cart/main.lua`（`src/pico8/workspace.js`，实现 pi-durable 的 ExecutionEnv 文件系统部分，没有 shell、没有其它文件）。
- 新增 pi-durable 内置 `edit` 工具（精确文本替换，带 diff），固定作用于当前卡带。修复和小改动按“read_game → edit → load_game（不带 source）”进行，不再整份重发源码；新游戏或大改仍可给 `load_game` 传完整源码。
- 工作稿与已提交版本分开：编辑只改工作稿，`load_game` 编译通过后才成为新版本；编译失败时工作稿保留、不提交，测试会话仍运行上一个版本。`reset_game`、导出和玩家试玩都用已提交版本。工作稿按卡带存入 IndexedDB 的 `workspace` 字段，撤销时重置。
- 界面：进度卡显示“Edited main.lua · n changes”，展开可见 `- 旧 / + 新`；版本卡只在真正提交新版本时出现并显示版本号。
- 未引入 just-bash：单文件卡带用不上 shell。以后若工作区变成多文件，可把它作为同一 ExecutionEnv 的 Shell 部分接入。

