# Vibe Reviewer

Vibe Reviewer 是一个面向本地代码审查的桌面应用。当前版本基于 Electron Forge、Vite、React、Tailwind CSS 和 shadcn 构建，主要用于查看项目 Git 差异、切换审查视图、浏览文件树，并在 diff 行上添加本地评论。

## 功能概览

- 支持未暂存、已暂存、分支差异等对比方式。
- 支持统一视图和分栏视图切换。
- 支持连续浏览和大 diff 自动单文件浏览。
- 支持文件树搜索、展开收起、宽度拖拽和文件右键操作。
- 支持 diff 文件头折叠、文件右键菜单、打开 VS Code、复制路径等操作。
- 支持在 diff 行号处打开多个本地评论框。
- 支持浅色、深色和跟随系统主题。
- 支持 macOS 风格窗口布局和工作区 tab。

## 技术栈

- Electron Forge：桌面应用运行、开发启动和打包。
- Vite：主进程、preload 和 renderer 构建。
- React：前端界面。
- Tailwind CSS：样式系统。
- shadcn：基础 UI 组件源码。
- lucide-react：图标。
- @pierre/diffs：Git diff 解析和 diff 内容渲染。
- motion：界面动效。

## 环境要求

- Node.js
- npm
- Git
- macOS 本地预览需要安装 Electron 运行所需环境。
- “在 VS Code 中打开”功能需要安装 VS Code，并可使用 `code` 命令，或 macOS 已安装 Visual Studio Code 应用。

## 安装依赖

```bash
npm install
```

项目中同时存在 `package-lock.json` 和 `pnpm-lock.yaml`，当前脚本以 `npm` 为准。如果后续统一到 pnpm，需要同步更新 README 和锁文件策略。

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
out/vibe-reviewer-darwin-arm64/vibe-reviewer.app
```

可以直接双击打开，或使用：

```bash
open out/vibe-reviewer-darwin-arm64/vibe-reviewer.app
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

```text
src/
  main.ts                         Electron 主进程入口
  preload.ts                      preload 脚本，向 renderer 暴露安全 API
  main-process/                   主进程 IPC 和本地服务
  shared/                         主进程与 renderer 共用的类型和通道定义
  services/                       renderer 侧服务封装
  domain/                         审查业务类型、diff 解析和 mock 数据
  hooks/                          可复用 hooks
  components/
    layout/                       macOS 风格窗口和工作区 tab
    review/                       审查工作区、工具栏、文件树和 diff 渲染
    session/                      会话列表
    settings/                     偏好设置
    terminal/                     终端工作区占位
    ui/                           shadcn 基础组件和项目通用 UI
```

## Electron 通信

Renderer 不直接访问 Node.js 能力。主进程能力通过 preload 暴露到：

```ts
window.vibeReviewer
```

当前暴露的能力包括：

- `review.runGitDiff`：执行 Git diff 并返回 diff 内容和文件快照。
- `review.loadLocalBranches`：读取当前项目本地分支。
- `review.openFileInVsCode`：在 VS Code 中打开文件。

IPC 通道定义位于 `src/shared/ipcChannels.ts`，类型定义位于 `src/shared/electronApi.ts`。

## Diff 渲染

Diff 数据加载流程：

```text
ReviewWorkspace
  -> services/reviewApi.ts
  -> window.vibeReviewer.review.runGitDiff
  -> main-process/services/gitReviewService.ts
  -> domain/diffParser.ts
  -> @pierre/diffs
```

`@pierre/diffs` 负责 patch 解析和 diff 内容渲染。应用层继续保留文件树、文件头、右键菜单、本地评论、折叠、大 diff 单文件模式等外围能力。

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

提交前建议至少执行：

```bash
npm run lint
git diff --check
```

涉及 Electron 打包或 preload、主进程、Forge 配置时，再执行：

```bash
npm run build
```
