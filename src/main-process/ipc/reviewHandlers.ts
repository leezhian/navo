import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type { LoadReviewDiffParams, OpenFileInVsCodeParams } from "../../shared/electronApi";
import { loadLocalBranches, openFileInVsCode, runGitDiff } from "../services/gitReviewService";

export function registerReviewHandlers() {
  ipcMain.handle(ipcChannels.reviewRunGitDiff, (_event, params: LoadReviewDiffParams) => runGitDiff(params));
  ipcMain.handle(ipcChannels.reviewLoadLocalBranches, (_event, projectPath: string) => loadLocalBranches(projectPath));
  ipcMain.handle(ipcChannels.reviewOpenFileInVsCode, (_event, params: OpenFileInVsCodeParams) =>
    openFileInVsCode(params),
  );
}
