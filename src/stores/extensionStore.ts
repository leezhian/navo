import { create } from "zustand";
import type { ExtensionStatus } from "@/shared/extensionTypes";
import { extensionErrorCode, getExtensionsApi } from "@/services/extensionsApi";

interface ExtensionState {
  status: ExtensionStatus | null;
  error: ReturnType<typeof extensionErrorCode> | null;
  pending: boolean;
  refresh: () => Promise<void>;
  run: (action: () => Promise<void>) => Promise<boolean>;
}
export const useExtensionStore = create<ExtensionState>((set) => ({
  status: null,
  error: null,
  pending: false,
  async refresh() {
    try {
      set({ status: await getExtensionsApi().status(), error: null });
    } catch (error) {
      set({ error: extensionErrorCode(error) });
    }
  },
  async run(action) {
    if (useExtensionStore.getState().pending) return false;
    set({ pending: true, error: null });
    try {
      await action();
      set({ status: await getExtensionsApi().status() });
      return true;
    } catch (error) {
      set({ error: extensionErrorCode(error) });
      return false;
    } finally {
      set({ pending: false });
    }
  },
}));
