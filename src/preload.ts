import { contextBridge, ipcRenderer } from "electron";
import type { LoadReviewDiffParams, OpenFileInVsCodeParams, VibeReviewerApi } from "./shared/electronApi";
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
  },
};

contextBridge.exposeInMainWorld("vibeReviewer", api);
