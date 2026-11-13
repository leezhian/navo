# CodeView Diff Virtualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Review diff pane's per-file `FileDiff` rendering with one `CodeView` rendering path while preserving current product behavior and visual affordances.

**Architecture:** `ReviewWorkspace` keeps the existing reading-mode and large-diff policy, but `DiffViewer` becomes a thin wrapper around a single `CodeView`. Business `DiffFile[]` is converted into `CodeViewItem[]`, while comments, headers, selection, and file context actions move into focused CodeView adapters.

**Tech Stack:** React, TypeScript, Tailwind CSS, `@pierre/diffs/react` `CodeView`, existing shadcn/lucide UI utilities.

## Global Constraints

- 保留“大 diff 强制单文件”逻辑，它既是性能策略也是产品功能。
- 不保留旧 `PierreDiffFile -> FileDiff` 主渲染路径。
- Review 主 Diff 区统一使用 `CodeView`；设置页轻量预览可继续使用 `PatchDiff`。
- 不新增依赖。
- 用户可见文案默认使用中文。
- 视觉和功能以当前 Diff 区为基准，迁移后不丢文件头、折叠、评论、右键菜单、主题、字号、split/unified、自动换行和 Git 文件操作。

---

### Task 1: Build CodeView Adapter Modules

**Files:**
- Create: `src/components/review/diff-code-view/DiffCodeView.tsx`
- Create: `src/components/review/diff-code-view/diffCodeViewItems.ts`
- Create: `src/components/review/diff-code-view/diffCodeViewOptions.ts`
- Create: `src/components/review/diff-code-view/useDiffCodeViewComments.ts`

**Interfaces:**
- Consumes: `DiffFile`, `AppSettings`, `ResolvedTheme`, `CompareMode`, existing comment metadata types.
- Produces: `DiffCodeView` component and helpers used by `DiffViewer`.

- [ ] Add `toCodeViewItems(files, collapsedFileIds, annotationsByFile)` that returns `CodeViewItem<LocalCommentMetadata>[]`.
- [ ] Add `getDiffCodeViewOptions(...)` that maps existing Pierre options to `CodeViewOptions<LocalCommentMetadata>`.
- [ ] Add `useDiffCodeViewComments()` by reusing current local comment behavior and returning CodeView-compatible `selectedLines` and annotations.
- [ ] Add `DiffCodeView` shell that renders `CodeView`, forwards a ref, and accepts header/annotation/gutter renderers.

### Task 2: Migrate Header, Comments, and Context Menu

**Files:**
- Create: `src/components/review/diff-code-view/DiffCodeViewContextMenu.tsx`
- Modify: `src/components/review/diff-viewer/DiffFileHeader.tsx`
- Modify: `src/components/review/DiffViewer.tsx`
- Modify: `src/components/review/file-actions/FileContextMenu.tsx`

**Interfaces:**
- Consumes: `DiffCodeView` from Task 1.
- Produces: current file header, comment, selected-line, and right-click behavior on top of CodeView.

- [ ] Render current `DiffFileHeader` from `CodeView.renderCustomHeader(item)`.
- [ ] Move comment annotation rendering to `CodeView.renderAnnotation`.
- [ ] Replace per-file diff context menus with a CodeView container menu that resolves the clicked file from the DOM item.
- [ ] Preserve file-level Git actions and wrap toggle.

### Task 3: Wire ReviewWorkspace Selection and Large-Diff Policy

**Files:**
- Modify: `src/components/review/ReviewWorkspace.tsx`
- Modify: `src/components/review/review-workspace/useFileSelection.ts`
- Modify: `src/components/review/review-workspace/reviewWorkspaceUtils.ts`
- Delete after replacement: `src/components/review/diff-viewer/PierreDiffFile.tsx`

**Interfaces:**
- Consumes: CodeView item ids and imperative `scrollTo`.
- Produces: existing continuous/single-file behavior using the new renderer.

- [ ] Keep `getEffectiveReadingMode` unchanged so large diffs still force `single-file`.
- [ ] In continuous mode, file-tree selection scrolls via `CodeView.scrollTo({ type: "item", id })`.
- [ ] In single-file mode, visible files remain filtered to the selected file.
- [ ] Remove old `PierreDiffFile` usage and delete the file once no imports remain.

### Task 4: Verify and Clean Up

**Files:**
- Modify as needed: stale imports and unused helper files.

**Interfaces:**
- Produces: verified implementation with no old main diff render path.

- [ ] Run `rg -n "PierreDiffFile|<FileDiff|scrollIntoView\\({ block: \\\"start\\\"" src/components/review`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `git diff --check`.
- [ ] Start the app only if a rendering issue needs visual inspection.

## Self-Review

- Spec coverage: the plan covers unified CodeView rendering, large-diff single-file retention, current UI migration, and conflict-friendly item modeling boundaries.
- Placeholder scan: no `TBD` or open-ended implementation placeholders.
- Type consistency: all planned modules consume the existing `DiffFile`, `LocalCommentMetadata`, `AppSettings`, and Pierre `CodeViewItem`/`CodeViewOptions` types.
