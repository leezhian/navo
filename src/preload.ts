import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  LoadReviewDiffParams,
  OpenFileInVsCodeParams,
  RunReviewBatchFileActionParams,
  RunReviewFileActionParams,
  VibeReviewerApi,
  WindowFullScreenListener,
} from "./shared/electronApi";
import { ipcChannels } from "./shared/ipcChannels";

const api: VibeReviewerApi = {
  review: {
    runGitDiff(params: LoadReviewDiffParams) {
      return ipcRenderer.invoke(ipcChannels.reviewRunGitDiff, params);
    },
    loadLocalBranches(projectPath: string) {
      return ipcRenderer.invoke(ipcChannels.reviewLoadLocalBranches, projectPath);
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
