import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  ArchiveReviewSessionParams,
  CommitChangesParams,
  ExternalLinkTarget,
  GetCommitStatusParams,
  LoadReviewDiffParams,
  MarkReviewSessionReadParams,
  OpenFileInVsCodeParams,
  ProjectPathParams,
  ReviewProjectChangedListener,
  ReviewSessionsChangedListener,
  RunReviewBatchFileActionParams,
  RunReviewFileActionParams,
  SetAgentIntegrationParams,
  VibeReviewerApi,
  WindowFullScreenListener,
} from "./shared/electronApi";
import { ipcChannels } from "./shared/ipcChannels";
import type {
  CreateTerminalParams,
  ResizeTerminalParams,
  TerminalSessionParams,
  WriteTerminalParams,
} from "./shared/terminalTypes";

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
    archiveSession(params: ArchiveReviewSessionParams) {
      return ipcRenderer.invoke(ipcChannels.reviewArchiveSession, params);
    },
    cleanStorage() {
      return ipcRenderer.invoke(ipcChannels.reviewCleanStorage);
    },
    getCommitStatus(params: GetCommitStatusParams) {
      return ipcRenderer.invoke(ipcChannels.reviewGetCommitStatus, params);
    },
    commitChanges(params: CommitChangesParams) {
      return ipcRenderer.invoke(ipcChannels.reviewCommitChanges, params);
    },
    pushCommits(params: ProjectPathParams) {
      return ipcRenderer.invoke(ipcChannels.reviewPushCommits, params);
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
    getGitDiffSignature(params: LoadReviewDiffParams) {
      return ipcRenderer.invoke(ipcChannels.reviewGetGitDiffSignature, params);
    },
    getUntrackedFileCount(params: ProjectPathParams) {
      return ipcRenderer.invoke(ipcChannels.reviewGetUntrackedFileCount, params);
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
    onProjectChanged(listener: ReviewProjectChangedListener) {
      const handler = (
        _event: IpcRendererEvent,
        payload: { projectPath: string },
      ) => {
        listener(payload.projectPath);
      };

      ipcRenderer.on(ipcChannels.reviewProjectChanged, handler);
      return () => ipcRenderer.removeListener(ipcChannels.reviewProjectChanged, handler);
    },
    watchProject(params: ProjectPathParams) {
      return ipcRenderer.invoke(ipcChannels.reviewWatchProject, params);
    },
    unwatchProject(params: ProjectPathParams) {
      return ipcRenderer.invoke(ipcChannels.reviewUnwatchProject, params);
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
  terminal: {
    create(params: CreateTerminalParams) {
      return ipcRenderer.invoke(ipcChannels.terminalCreate, params);
    },
    write(params: WriteTerminalParams) {
      return ipcRenderer.invoke(ipcChannels.terminalWrite, params);
    },
    resize(params: ResizeTerminalParams) {
      return ipcRenderer.invoke(ipcChannels.terminalResize, params);
    },
    destroy(params: TerminalSessionParams) {
      return ipcRenderer.invoke(ipcChannels.terminalDestroy, params);
    },
    onData(listener) {
      const handler = (_event: IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
        listener(payload);
      };

      ipcRenderer.on(ipcChannels.terminalData, handler);
      return () => ipcRenderer.removeListener(ipcChannels.terminalData, handler);
    },
    onExit(listener) {
      const handler = (_event: IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
        listener(payload);
      };

      ipcRenderer.on(ipcChannels.terminalExit, handler);
      return () => ipcRenderer.removeListener(ipcChannels.terminalExit, handler);
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
