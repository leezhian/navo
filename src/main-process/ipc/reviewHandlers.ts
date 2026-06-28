import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type {
  LoadReviewDiffParams,
  OpenFileInVsCodeParams,
  RunReviewBatchFileActionParams,
  RunReviewFileActionParams,
} from "../../shared/electronApi";
import {
  loadLocalBranches,
  openFileInVsCode,
  runGitDiff,
  runReviewBatchFileAction,
  runReviewFileAction,
} from "../services/gitReviewService";

export function registerReviewHandlers() {
  ipcMain.handle(ipcChannels.reviewRunGitDiff, (_event, params: LoadReviewDiffParams) => runGitDiff(params));
  ipcMain.handle(ipcChannels.reviewLoadLocalBranches, (_event, projectPath: string) => loadLocalBranches(projectPath));
  ipcMain.handle(ipcChannels.reviewOpenFileInVsCode, (_event, params: OpenFileInVsCodeParams) =>
    openFileInVsCode(params),
  );
  ipcMain.handle(ipcChannels.reviewRunBatchFileAction, (_event, params: RunReviewBatchFileActionParams) =>
    runReviewBatchFileAction(params),
  );
  ipcMain.handle(ipcChannels.reviewRunFileAction, (_event, params: RunReviewFileActionParams) =>
    runReviewFileAction(params),
  );
}
