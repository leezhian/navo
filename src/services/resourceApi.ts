import type { CloneProgress, CloneResourceParams, ResourceRecord, SaveResourceParams } from "@/shared/settingsTypes";
import { isDesktop, settingsApi } from "./settingsApi";
import { getFolderName } from "@/utils/resourceNames";

function api() {
  if (!isDesktop()) throw new Error("DESKTOP_REQUIRED");
  return window.navo.resources;
}

export const resourceApi = {
  list: () => api().list(),
  inspectGit: (localPath: string, forceRefresh = false) => api().inspectGit(localPath, forceRefresh),
  save: (params: SaveResourceParams) => api().save(params),
  addFolder: (localPath: string) => api().save({ kind: "folder", name: getFolderName(localPath), localPath }),
  async chooseAndAddFolder(): Promise<ResourceRecord | null> {
    const localPath = await settingsApi.chooseDirectory();
    return localPath ? resourceApi.addFolder(localPath) : null;
  },
  remove: (id: string) => api().remove(id),
  clone: (params: CloneResourceParams) => api().clone(params),
  cancelClone: (id: string) => api().cancelClone(id),
  onCloneProgress: (listener: (progress: CloneProgress) => void) => api().onCloneProgress(listener),
  getDroppedPath: (file: File) => api().getDroppedPath(file),
};
