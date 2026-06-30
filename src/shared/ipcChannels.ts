export const ipcChannels = {
  appCheckForUpdates: "app:check-for-updates",
  appGetInfo: "app:get-info",
  appOpenExternalLink: "app:open-external-link",
  reviewRunGitDiff: "review:run-git-diff",
  reviewLoadLocalBranches: "review:load-local-branches",
  reviewOpenFileInVsCode: "review:open-file-in-vscode",
  reviewRunBatchFileAction: "review:run-batch-file-action",
  reviewRunFileAction: "review:run-file-action",
  windowFullScreenChanged: "window:full-screen-changed",
  windowGetIsFullScreen: "window:get-is-full-screen",
} as const;
