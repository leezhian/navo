import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  ExternalLinkTarget,
  LoadReviewDiffParams,
  MarkReviewSessionReadParams,
  OpenFileInVsCodeParams,
  ReviewSessionsChangedListener,
  RunReviewBatchFileActionParams,
  RunReviewFileActionParams,
  SetAgentIntegrationParams,
  VibeReviewerApi,
  WindowFullScreenListener,
} from "./shared/electronApi";
import { ipcChannels } from "./shared/ipcChannels";

const api: VibeReviewerApi = {
  app: {
    getInfo() {
      return ipcRenderer.invoke(ipcChannels.appGetInfo);
    },
    openExternalLink(target: ExternalLinkTarget) {
      return ipcRenderer.invoke(ipcChannels.appOpenExternalLink, target);
    },
    checkForUpdates() {
      return ipcRenderer.invoke(ipcChannels.appCheckForUpdates);
    },
  },
  review: {
    loadSessions() {
      return ipcRenderer.invoke(ipcChannels.reviewLoadSessions);
    },
    markSessionRead(params: MarkReviewSessionReadParams) {
      return ipcRenderer.invoke(ipcChannels.reviewMarkSessionRead, params);
    },
    loadAgentIntegrationStatuses() {
      return ipcRenderer.invoke(ipcChannels.reviewLoadAgentIntegrationStatuses);
    },
    setAgentIntegrationEnabled(params: SetAgentIntegrationParams) {
      return ipcRenderer.invoke(ipcChannels.reviewSetAgentIntegrationEnabled, params);
    },
    runGitDiff(params: LoadReviewDiffParams) {
      return ipcRenderer.invoke(ipcChannels.reviewRunGitDiff, params);
    },
    loadLocalBranches(projectPath: string) {
      return ipcRenderer.invoke(ipcChannels.reviewLoadLocalBranches, projectPath);
    },
    onSessionsChanged(listener: ReviewSessionsChangedListener) {
      const handler = (_event: IpcRendererEvent, sessions: Parameters<ReviewSessionsChangedListener>[0]) => {
        listener(sessions);
      };

      ipcRenderer.on(ipcChannels.reviewSessionsChanged, handler);
      return () => ipcRenderer.removeListener(ipcChannels.reviewSessionsChanged, handler);
    },
    openFileInVsCode(params: OpenFileInVsCodeParams) {
      return ipcRenderer.invoke(ipcChannels.reviewOpenFileInVsCode, params);
    },
    runBatchFileAction(params: RunReviewBatchFileActionParams) {
      return ipcRenderer.invoke(ipcChannels.reviewRunBatchFileAction, params);
    },
    runFileAction(params: RunReviewFileActionParams) {
      return ipcRenderer.invoke(ipcChannels.reviewRunFileAction, params);
    },
  },
  window: {
    getIsFullScreen() {
      return ipcRenderer.invoke(ipcChannels.windowGetIsFullScreen);
    },
    onFullScreenChange(listener: WindowFullScreenListener) {
      const handler = (_event: IpcRendererEvent, isFullScreen: boolean) => {
        listener(isFullScreen);
      };

      ipcRenderer.on(ipcChannels.windowFullScreenChanged, handler);
      return () => ipcRenderer.removeListener(ipcChannels.windowFullScreenChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld("vibeReviewer", api);
