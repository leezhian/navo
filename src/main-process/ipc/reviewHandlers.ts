import { ipcMain } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import type {
  ArchiveReviewSessionParams,
  LoadReviewDiffParams,
  MarkReviewSessionReadParams,
  OpenFileInVsCodeParams,
  ProjectPathParams,
  RunReviewBatchFileActionParams,
  RunReviewFileActionParams,
  SetAgentIntegrationParams,
} from "../../shared/electronApi";
import { loadAgentIntegrationStatuses, setAgentIntegrationEnabled } from "../services/agentHookConfigService";
import {
  getGitDiffSignature,
  getUntrackedFileCount,
  loadLocalBranches,
  openFileInVsCode,
  runGitDiff,
  runReviewBatchFileAction,
  runReviewFileAction,
} from "../services/gitReviewService";
import { unwatchProject, watchProject } from "../services/projectChangeWatcher";
import {
  archiveReviewSession,
  cleanupReviewStorage,
  loadReviewSessions,
  markReviewSessionRead,
} from "../services/reviewStorage";

export function registerReviewHandlers() {
  ipcMain.handle(ipcChannels.reviewLoadSessions, () => loadReviewSessions());
  ipcMain.handle(ipcChannels.reviewMarkSessionRead, (_event, params: MarkReviewSessionReadParams) =>
    markReviewSessionRead(params.sessionId, params.updatedAt),
  );
  ipcMain.handle(ipcChannels.reviewArchiveSession, (_event, params: ArchiveReviewSessionParams) =>
    archiveReviewSession(params.sessionId),
  );
  ipcMain.handle(ipcChannels.reviewCleanStorage, () => cleanupReviewStorage());
  ipcMain.handle(ipcChannels.reviewLoadAgentIntegrationStatuses, () => loadAgentIntegrationStatuses());
  ipcMain.handle(ipcChannels.reviewSetAgentIntegrationEnabled, (_event, params: SetAgentIntegrationParams) =>
    setAgentIntegrationEnabled(params.agent, params.enabled),
  );
  ipcMain.handle(ipcChannels.reviewRunGitDiff, (_event, params: LoadReviewDiffParams) => runGitDiff(params));
  ipcMain.handle(ipcChannels.reviewGetGitDiffSignature, (_event, params: LoadReviewDiffParams) =>
    getGitDiffSignature(params),
  );
  ipcMain.handle(ipcChannels.reviewGetUntrackedFileCount, (_event, params: ProjectPathParams) =>
    getUntrackedFileCount(params.projectPath),
  );
  ipcMain.handle(ipcChannels.reviewWatchProject, (_event, params: ProjectPathParams) => {
    watchProject(params.projectPath);
  });
  ipcMain.handle(ipcChannels.reviewUnwatchProject, (_event, params: ProjectPathParams) => {
    unwatchProject(params.projectPath);
  });
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
