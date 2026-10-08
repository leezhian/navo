import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppSettings } from "./domain/types";
import type { CloneProgress, CloneResourceParams, SaveResourceParams } from "./shared/settingsTypes";
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
  NavoApi,
  WindowFullScreenListener,
} from "./shared/electronApi";
import { ipcChannels } from "./shared/ipcChannels";
import type {
  CreateTerminalParams,
  ResizeTerminalParams,
  TerminalSessionParams,
  WriteTerminalParams,
} from "./shared/terminalTypes";

const api: NavoApi = {
  taskSessions: {
    list: () => ipcRenderer.invoke(ipcChannels.taskSessionsList),
    start: (input) => ipcRenderer.invoke(ipcChannels.taskSessionsStart, input),
    stop: (id) => ipcRenderer.invoke(ipcChannels.taskSessionsStop, id),
    archive: (id) => ipcRenderer.invoke(ipcChannels.taskSessionsArchive, id),
    rename: (id, title) => ipcRenderer.invoke(ipcChannels.taskSessionsRename, id, title),
    remove: (id) => ipcRenderer.invoke(ipcChannels.taskSessionsRemove, id),
    restart: (id, resume) => ipcRenderer.invoke(ipcChannels.taskSessionsRestart, id, resume),
    revealAttachment: (taskId, id) => ipcRenderer.invoke(ipcChannels.taskSessionsRevealAttachment, taskId, id),
    openLink: (taskId, id) => ipcRenderer.invoke(ipcChannels.taskSessionsOpenLink, taskId, id),
    onChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, sessions: Parameters<typeof listener>[0]) => listener(sessions);
      ipcRenderer.on(ipcChannels.taskSessionsChanged, handler);
      return () => ipcRenderer.removeListener(ipcChannels.taskSessionsChanged, handler);
    },
  },
  agents: {
    capabilitySnapshot: () => ipcRenderer.invoke(ipcChannels.agentsCapabilitySnapshot),
    onCapabilitiesChanged: (listener) => {
      const handler = () => listener();
      ipcRenderer.on(ipcChannels.agentsCapabilitiesChanged, handler);
      return () => ipcRenderer.removeListener(ipcChannels.agentsCapabilitiesChanged, handler);
    },
    capabilities: (id) => ipcRenderer.invoke(ipcChannels.agentsCapabilities, id),
    load: () => ipcRenderer.invoke(ipcChannels.agentsLoad),
    scan: (id) => ipcRenderer.invoke(ipcChannels.agentsScan, id),
    save: (input) => ipcRenderer.invoke(ipcChannels.agentsSave, input),
    setDefault: (id) => ipcRenderer.invoke(ipcChannels.agentsSetDefault, id),
    chooseBinary: () => ipcRenderer.invoke(ipcChannels.agentsChooseBinary),
    openDocumentation: (id) => ipcRenderer.invoke(ipcChannels.agentsOpenDocumentation, id),
    prepare: (id, action) => ipcRenderer.invoke(ipcChannels.agentsPrepare, id, action),
    startOperation: (params) => ipcRenderer.invoke(ipcChannels.agentsStartOperation, params),
    discardPlans: () => ipcRenderer.invoke(ipcChannels.agentsDiscardPlans),
  },
  diagnostics: {
    report: (report) => ipcRenderer.invoke(ipcChannels.diagnosticsReport, report),
  },
  tasks: {
    loadBranch: (taskId, resourceId) => ipcRenderer.invoke(ipcChannels.tasksLoadBranch, taskId, resourceId),
    load: () => ipcRenderer.invoke(ipcChannels.tasksLoad),
    importLegacy: (value) => ipcRenderer.invoke(ipcChannels.tasksImportLegacy, value),
    create: (value) => ipcRenderer.invoke(ipcChannels.tasksCreate, value),
    workspaceOpenOptions: (id, resourceId) => ipcRenderer.invoke(ipcChannels.tasksWorkspaceOpenOptions, id, resourceId),
    openWorkspace: (id, resourceId, target) => ipcRenderer.invoke(ipcChannels.tasksOpenWorkspace, id, resourceId, target),
    addResources: (id, input) => ipcRenderer.invoke(ipcChannels.tasksAddResources, id, input),
    chooseResourceFile: () => ipcRenderer.invoke(ipcChannels.tasksChooseResourceFile),
    releaseResourceFiles: (ids) => ipcRenderer.invoke(ipcChannels.tasksReleaseResourceFiles, ids),
    revealResourceFile: (id, fileId) => ipcRenderer.invoke(ipcChannels.tasksRevealResourceFile, id, fileId),
    inspectResource: (id) => ipcRenderer.invoke(ipcChannels.tasksInspectResource, id),
    chooseFiles: () => ipcRenderer.invoke(ipcChannels.tasksChooseFiles),
    releaseFiles: (ids) => ipcRenderer.invoke(ipcChannels.tasksReleaseFiles, ids),
    previewAttachment: (id, fileId) => ipcRenderer.invoke(ipcChannels.tasksPreviewAttachment, id, fileId),
    rename: (id, title) => ipcRenderer.invoke(ipcChannels.tasksRename, id, title),
    move: (id, status, beforeId) => ipcRenderer.invoke(ipcChannels.tasksMove, id, status, beforeId),
    restore: (id) => ipcRenderer.invoke(ipcChannels.tasksRestore, id),
    inspectDeletion: (id, options) => ipcRenderer.invoke(ipcChannels.tasksInspectDeletion, id, options),
    remove: (id, confirmation) => ipcRenderer.invoke(ipcChannels.tasksRemove, id, confirmation),
  },
  settings: {
    load: () => ipcRenderer.invoke(ipcChannels.settingsLoad),
    save: (settings: AppSettings) => ipcRenderer.invoke(ipcChannels.settingsSave, settings),
    chooseDirectory: () => ipcRenderer.invoke(ipcChannels.settingsChooseDirectory),
    clearLogs: () => ipcRenderer.invoke(ipcChannels.settingsClearLogs),
    chooseLogFile: () => ipcRenderer.invoke(ipcChannels.settingsChooseLogFile),
    revealLogFile: () => ipcRenderer.invoke(ipcChannels.settingsRevealLogFile),
    getLogsStatus: () => ipcRenderer.invoke(ipcChannels.settingsLogsStatus),
  },
  resources: {
    list: () => ipcRenderer.invoke(ipcChannels.resourcesList),
    inspectGit: (localPath, forceRefresh) => ipcRenderer.invoke(ipcChannels.resourcesInspectGit, localPath, forceRefresh),
    save: (params: SaveResourceParams) => ipcRenderer.invoke(ipcChannels.resourcesSave, params),
    remove: (id: string) => ipcRenderer.invoke(ipcChannels.resourcesRemove, id),
    clone: (params: CloneResourceParams) => ipcRenderer.invoke(ipcChannels.resourcesClone, params),
    cancelClone: (operationId: string) => ipcRenderer.invoke(ipcChannels.resourcesCancelClone, operationId),
    getDroppedPath: (file: File) => webUtils.getPathForFile(file),
    onCloneProgress(listener) {
      const handler = (_event: IpcRendererEvent, progress: CloneProgress) => listener(progress);
      ipcRenderer.on(ipcChannels.resourcesCloneProgress, handler);
      return () => ipcRenderer.removeListener(ipcChannels.resourcesCloneProgress, handler);
    },
  },
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

contextBridge.exposeInMainWorld("navo", api);
