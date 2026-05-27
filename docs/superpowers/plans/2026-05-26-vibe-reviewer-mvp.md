# Vibe Reviewer MVP 实现计划

> **给 agentic worker：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行。步骤使用 checkbox 便于跟踪。

**目标：** 从 Tauri starter 实现 Vibe Reviewer 的首个可用本地桌面审查体验。

**架构：** React 负责 UI 状态和渲染，Tauri command 负责本地 Git CLI 能力。diff 解析和文件树构建放在 `domain`，UI 通过结构化数据渲染 mock diff 与真实 Git diff。

**技术栈：** Tauri 2、React 19、Vite、TypeScript、Rust 标准库、Git CLI、CSS。未经用户确认不新增依赖。

---

## 目录结构

- `src/domain/types.ts`：Agent、会话、设置、对比模式、diff 文件、hunk、line 等领域类型。
- `src/domain/mockData.ts`：稳定 mock 会话和 diff，用于 UI 验证与浏览器开发 fallback。
- `src/domain/diffParser.ts`：将 unified Git diff 文本解析为结构化 `DiffFile[]`。
- `src/domain/fileTree.ts`：将变更文件转换为目录树。
- `src/services/reviewApi.ts`：Tauri command 的类型化封装。
- `src/hooks/useLocalSettings.ts`：主题和 diff 偏好本地持久化。
- `src/components/layout`：macOS 窗口壳层。
- `src/components/session`：会话侧栏。
- `src/components/review`：审查工具栏、diff 渲染、文件树、状态块。
- `src/components/settings`：设置面板。
- `src/utils`：纯工具函数。
- `src/App.tsx`：只做顶层状态编排。
- `src/App.css`：macOS 风格视觉系统和布局样式。
- `src-tauri/src/lib.rs`：Git diff、分支等 Tauri command。

## 任务 1：领域模型和 mock 数据

- [x] 新建 `src/domain/types.ts`，定义领域类型。
- [x] 新建 `src/domain/mockData.ts`，提供 mock 会话和 mock diff。
- [x] 新建 `src/domain/diffParser.ts`，解析 Git diff。
- [x] 新建 `src/domain/fileTree.ts`，构建文件树。

## 任务 2：Tauri Git 能力

- [x] 修改 `src-tauri/src/lib.rs`，移除 starter greet command。
- [x] 新增 `run_git_diff`、`git_current_branch`、`git_branches`。
- [x] 新建 `src/services/reviewApi.ts`，封装 Tauri invoke。
- [x] 在浏览器 dev 环境下提供 mock fallback，方便 UI 验证。

## 任务 3：设置状态和主题

- [x] 新建 `src/hooks/useLocalSettings.ts`。
- [x] 使用 `localStorage` 持久化主题、Agent 开关和 diff 偏好。
- [x] 通过 `document.documentElement.dataset.theme` 切换浅色/深色。

## 任务 4：可维护组件结构

- [x] 新建 `src/components/layout/MacWindow.tsx`。
- [x] 新建 `src/components/session/SessionSidebar.tsx`。
- [x] 新建 `src/components/settings/SettingsPanel.tsx`。
- [x] 新建 `src/components/review/ReviewToolbar.tsx`。
- [x] 新建 `src/components/review/DiffViewer.tsx`。
- [x] 新建 `src/components/review/FileTree.tsx`。
- [x] 新建 `src/components/review/StateBlock.tsx`。
- [x] 新建 `src/components/review/ReviewWorkspace.tsx`。
- [x] 保持 `src/App.tsx` 为顶层状态编排文件，不承载具体 UI 细节。

## 任务 5：审查工作区功能

- [x] 实现两行顶部通栏。
- [x] 实现对比方式切换。
- [x] 实现刷新按钮。
- [x] 实现统一/分栏视图切换。
- [x] 实现差异换行开关。
- [x] 实现折叠/展开全部。
- [x] 实现文件树点击定位或切换文件。
- [x] 实现加载、无改动、Git 错误状态。

## 任务 6：大 diff 和边界状态

- [x] `diffParser` 标记单文件大 diff。
- [x] 总 diff 超过阈值时标记 `isLargeDiff`。
- [x] 大 diff 自动进入单文件模式。
- [x] 二进制文件展示占位。
- [x] 大文件默认折叠。

## 任务 7：视觉落地

- [x] 重写 `src/App.css`，实现 macOS 风格窗口、会话侧栏、审查通栏、diff、文件树和设置页。
- [x] 支持浅色和深色主题变量。
- [x] 避免卡片套卡片和过度装饰。

## 任务 8：最终验证

- [ ] 运行 `pnpm build`。
- [ ] 如需要，运行 Tauri 构建或 Rust 编译验证。
- [ ] 启动本地 dev server 并检查主要 UI 状态。
- [ ] 修复构建和视觉验证中发现的问题。

