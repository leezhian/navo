export const ipcChannels = {
  reviewRunGitDiff: "review:run-git-diff",
  reviewLoadLocalBranches: "review:load-local-branches",
  reviewOpenFileInVsCode: "review:open-file-in-vscode",
  windowFullScreenChanged: "window:full-screen-changed",
  windowGetIsFullScreen: "window:get-is-full-screen",
} as const;
