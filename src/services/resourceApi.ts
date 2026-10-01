import type { CloneResourceParams, SaveResourceParams } from "@/shared/settingsTypes";
import { isDesktop } from "./settingsApi";

function api() {
  if (!isDesktop()) throw new Error("DESKTOP_REQUIRED");
  return window.navo.resources;
}

export const resourceApi = {
  list: () => api().list(),
  save: (params: SaveResourceParams) => api().save(params),
  remove: (id: string) => api().remove(id),
  clone: (params: CloneResourceParams) => api().clone(params),
  cancelClone: (id: string) => api().cancelClone(id),
};
