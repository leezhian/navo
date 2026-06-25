import type { AppSettings, ReviewSession } from "./types";

export const defaultSettings: AppSettings = {
  enabledAgents: {
    "Claude Code": true,
    Codex: true,
    OpenCode: false,
    Qoder: false,
  },
  agentStatuses: {
    "Claude Code": "listening",
    Codex: "listening",
    OpenCode: "disabled",
    Qoder: "disabled",
  },
  theme: "system",
  diffViewMode: "split",
  wrapDiffLines: false,
  readingMode: "continuous",
  targetBranch: "origin/main",
};

export const mockSessions: ReviewSession[] = [
  {
    id: "session-codex-vibe-reviewer",
    agent: "Codex",
    projectPath: "/Users/kim/Project/vibe-reviewer",
    projectName: "vibe-reviewer",
    branchName: "feature/review-ui",
    startedAt: "2026-05-26T13:30:00.000Z",
    endedAt: "2026-05-26T14:10:00.000Z",
    updatedAt: "2026-05-26T14:10:00.000Z",
    fileCount: 6,
    additions: 188,
    deletions: 42,
    unread: true,
    hasBaseline: true,
  },
  {
    id: "session-claude-fq-mall",
    agent: "Claude Code",
    projectPath: "/Users/kim/Project/fq-mall",
    projectName: "fq-mall",
    branchName: "live-play-route",
    startedAt: "2026-05-25T09:00:00.000Z",
    endedAt: "2026-05-25T09:24:00.000Z",
    updatedAt: "2026-05-25T09:24:00.000Z",
    fileCount: 2,
    additions: 31,
    deletions: 8,
    unread: false,
    hasBaseline: false,
  },
  {
    id: "session-opencode-utils",
    agent: "OpenCode",
    projectPath: "/Users/kim/Project/fq-weapp-ui",
    projectName: "fq-weapp-ui",
    branchName: "main",
    startedAt: "2026-05-24T12:15:00.000Z",
    endedAt: "2026-05-24T12:34:00.000Z",
    updatedAt: "2026-05-24T12:34:00.000Z",
    fileCount: 4,
    additions: 72,
    deletions: 16,
    unread: false,
    hasBaseline: true,
  },
];

export const mockRawDiff = `diff --git a/workspaces/web/pages/@components/PageContainer/index.scss b/workspaces/web/pages/@components/PageContainer/index.scss
index 91d43a2..c7a9e15 100644
--- a/workspaces/web/pages/@components/PageContainer/index.scss
+++ b/workspaces/web/pages/@components/PageContainer/index.scss
@@ -1,3 +1,3 @@
-.page-container {
+.page-container--show-footer {
   padding-bottom: 56px;
 }
diff --git a/workspaces/web/pages/@components/PageContainer/index.tsx b/workspaces/web/pages/@components/PageContainer/index.tsx
index 120a4ac..f37e9bd 100644
--- a/workspaces/web/pages/@components/PageContainer/index.tsx
+++ b/workspaces/web/pages/@components/PageContainer/index.tsx
@@ -65,6 +65,6 @@
 const headerProps = getHeaderProps(props);
 return (
-<div className={classNames('page-container', className)}>
+<div className={classNames('page-container', { 'page-container--show-footer': showFooter }, className)}>
 {headerProps && <PageHeader {...headerProps} />}
 {children}
 )
diff --git a/src/main-process/ipc/reviewHandlers.ts b/src/main-process/ipc/reviewHandlers.ts
index f7a5a2a..34c4d3b 100644
--- a/src/main-process/ipc/reviewHandlers.ts
+++ b/src/main-process/ipc/reviewHandlers.ts
@@ -1,4 +1,5 @@
-export function registerHandlers() {
+export function registerReviewHandlers() {
+  ipcMain.handle("review:run-git-diff", runGitDiff);
 }
${" "}
 export function runGitDiff() {
`;
