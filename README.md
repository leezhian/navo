# Navo

Navo 是面向本地开发者的 Agent 开发环境（ADE），使用 Electron Forge、Vite、React、Tailwind CSS、shadcn 和 Radix UI 构建。正式应用已使用新版 Tasks / Issue 导航壳层，设置也迁入相同的独立圆角块风格。

## 功能概览

- Tasks：TODO、DONE、ARCHIVED 三列，卡片只显示标题、日期和项目名。
- 支持列内排序、跨列状态调整、页面内圆角浮动卡片、框占位与重排动画；任务状态和顺序保存在本地。
- Tasks 工具栏支持状态/项目过滤、看板/列表切换、日期排序和日期/项目显隐；日期排序不覆盖自定义顺序，仅看板自定义顺序支持拖拽。
- Issue：PR / ISSUE 两个默认展开且可收起的分组，左侧标签与标题，右侧自然宽度的项目、彩色状态文字和时间。
- Issue 工具栏支持分组/状态/项目/标签过滤、组内时间排序及字段显隐；过滤与显示设置独立于 Tasks，不修改条目数据。
- 点击任务或条目展开独立右侧详情，通过 8px 分隔条拖动调整宽度。
- 顶部提供模块历史后退与前进及固定数据的工作区标签占位，支持本地选中、关闭和横向拖拽排序，暂不切换任务内容；左侧底部为设置，不再提供旧会话列表。
- 保留浅色、深色、跟随系统主题与 diff 阅读偏好；关于页移除存储区。
- 保留可复用 ReviewDialog、Git diff / 文件树 / 评论 / Git 操作和终端基础组件，当前新版不提供审查或终端入口。

数据边界：目前尚未接入任务创建、Agent 运行或远程 PR/Issue 平台。开发态为设计预览提供示例数据，并使用独立的本地存储命名空间；正式构建首次启动显示空看板和空列表，不将旧会话当作任务。旧审查记录保持在磁盘中，但上轮对话审查模式已移除。

## 技术栈

- Electron Forge：桌面应用运行、开发启动和打包。
- Vite：主进程、preload 和 renderer 构建。
- React：前端界面。
- Tailwind CSS：样式系统。
- shadcn：基础 UI 组件源码。
- lucide-react：图标。
- @pierre/diffs：Git diff 解析和 diff 内容渲染。
- motion：界面动效。
- node-pty：创建和管理真实 Shell 伪终端。
- libghostty-vt：解析终端 VT 序列并生成终端画面。

## 环境要求

- Node.js
- pnpm
- Git
- macOS 本地预览需要安装 Electron 运行所需环境。
- “在 VS Code 中打开”功能需要安装 VS Code，并可使用 `code` 命令，或 macOS 已安装 Visual Studio Code 应用。

## 安装依赖

```bash
pnpm install
```

项目使用 `pnpm-lock.yaml` 锁定依赖。脚本仍可通过 `npm run <script>` 执行，但新增或更新依赖时应使用 pnpm，避免锁文件漂移。

## 本地开发

启动真实 Electron 桌面窗口：

```bash
npm run start
```

这个命令会执行 `electron-forge start`，适合日常开发和交互预览。

## 构建打包

生成本地 Electron 应用包：

```bash
npm run build
```

当前 `build` 实际执行的是：

```bash
electron-forge package
```

构建过程会先运行 Vite 构建，再执行 Electron Forge 打包。首次打包可能需要访问网络下载或校验 Electron 相关资源；如果卡在 `Packaging application`、`Copying files`、`Preparing native dependencies` 或 `Finalizing package`，优先检查网络和 Electron 缓存。

macOS 构建产物通常位于：

```bash
out/Navo-darwin-arm64/Navo.app
```

可以直接双击打开，或使用：

```bash
open out/Navo-darwin-arm64/Navo.app
```

## 常用脚本

```bash
npm run start
npm run build
npm run package
npm run make
npm run publish
npm run lint
```

- `start`：启动开发态 Electron 应用。
- `build` / `package`：打包本地应用目录。
- `make`：生成分发安装包。
- `publish`：发布分发产物。
- `lint`：运行 ESLint。

## 项目结构

- src/components/layout：窗口壳层、一级导航和共用的可调整双区域布局。
- src/components/tasks：任务看板、任务卡片与详情。
- src/components/issues：PR/ISSUE 分组列表、状态标签及详情。
- src/components/settings：外观、diff 阅读偏好和关于。
- src/components/review：保留的 diff 弹窗与审查组件。
- src/components/terminal：保留的终端渲染和生命周期能力。
- src/hooks：导航历史、任务拖拽、本地任务及分隔条调整。
- src/domain：任务、Issue、审查与设置的业务类型。
- src/services：渲染进程本地数据访问及 Electron IPC 封装。
- src/main-process / src/shared：主进程服务与共用 IPC 类型。
- src/utils：任务排序、本地数据校验等纯函数。

## 本地数据兼容

新安装使用 Navo 数据目录；如果仅存在旧版 Vibe Reviewer 数据目录，则继续使用旧目录，不移动历史 patch。旧版用户目录和阅读偏好仍可读取，偏好写入新的 `navo` 存储键。官网与报告 Bug 链接继续指向现有 GitHub 仓库，不因应用更名而假定远端仓库已改名。

## Electron 通信

Renderer 不直接访问 Node.js 能力。主进程能力通过 preload 暴露到：

```ts
window.navo
```

当前暴露的能力包括：

- `review.runGitDiff`：执行 Git diff 并返回 diff 内容和文件快照。
- `review.loadLocalBranches`：读取当前项目本地分支。
- `review.openFileInVsCode`：在 VS Code 中打开文件。
- `terminal.create/write/resize/destroy`：管理与当前窗口绑定的 PTY 会话。
- `terminal.onData/onExit`：订阅 Shell 输出和退出状态。

IPC 通道定义位于 `src/shared/ipcChannels.ts`，类型定义位于 `src/shared/electronApi.ts`。

## Diff 渲染

Diff 数据加载流程：

```text
ReviewWorkspace
  -> services/reviewApi.ts
  -> window.navo.review.runGitDiff
  -> main-process/services/gitReviewService.ts
  -> domain/diffParser.ts
  -> @pierre/diffs
```

`@pierre/diffs` 负责 patch 解析和 diff 内容渲染。应用层继续保留文件树、文件头、右键菜单、本地评论、折叠、大 diff 单文件模式等外围能力。

## 内嵌终端

终端组件、VT 渲染、node-pty 主进程服务与独立 Shell 生命周期保留。新导航壳层不展示旧审查/终端 tab 或新增终端按钮，后续任务流程接入时再定义入口，不依赖旧会话列表。

## UI 组件

基础组件来自 shadcn，本地源码放在：

```text
src/components/ui
```

当前 shadcn 配置位于 `components.json`，style 使用：

```json
"style": "radix-nova"
```

同步 shadcn 组件时，注意不要覆盖项目自定义组件，例如：

```text
src/components/ui/icon-tooltip.tsx
```

项目约定 tooltip 不显示小尖尖，如果重新拉取 `tooltip` 组件，需要确认没有重新引入 `TooltipPrimitive.Arrow`。

## 开发约束

- 用户可见文案默认使用中文。
- UI 优先使用 Tailwind CSS 和 shadcn 组件。
- 图标优先使用 `lucide-react`。
- 新增依赖前需要先确认。
- 页面负责组装，组件负责展示，hooks 负责逻辑，utils 负责纯函数处理。
- 自定义组件 props 类型需要写必要注释。
- 复杂逻辑不要堆在 JSX 中，优先拆到组件、hooks、utils 或 domain 层。

## 验证建议

- npm run lint：检查所有 TypeScript / TSX。
- npx tsc --noEmit：检查类型及模块集成。
- node --test scripts/review-data-regression.test.mjs scripts/ade-data-regression.test.mjs：审查、任务排序、导航与本地数据回归。
- git diff --check：检查补丁空白错误。
- npm run build：打包 Electron 应用；包含 Vite renderer 构建和原生依赖准备。

重点检查 Tasks 与 Issue 的点击/拖拽区分、跨列数量、分组收起、右侧详情、8px 分隔条、模块前进后退以及主题切换。开发样例与正式空状态分别验收。
