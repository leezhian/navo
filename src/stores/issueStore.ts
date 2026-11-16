import { create } from "zustand";
import type { IssueItem } from "@/domain/issues";
import type { IssueListFailure } from "@/shared/integrationTypes";
import { importLocalIssues, listMineIssues, onIssuesChanged } from "@/services/integrationApi";
import { loadIssueItems } from "@/services/adeData";

interface IssueStore {
  items: IssueItem[];
  failures: IssueListFailure[];
  fetchedAt: string | null;
  stale: boolean;
  loading: boolean;
  error: string | null;
  migrated: boolean;
  refresh: (options?: { force?: boolean }) => Promise<void>;
}

let subscribed = false;

export const useIssueStore = create<IssueStore>((set, get) => ({
  items: [],
  failures: [],
  fetchedAt: null,
  stale: false,
  loading: false,
  error: null,
  migrated: false,
  async refresh(options = {}) {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      if (!subscribed && window.navo?.issues) {
        subscribed = true;
        onIssuesChanged(() => { void get().refresh(); });
      }
      if (!get().migrated && window.navo?.issues) {
        const locals = loadIssueItems();
        if (locals.length) {
          try { await importLocalIssues(locals); }
          catch { /* 主进程不可用时仍展示本地缓存 */ }
        }
        set({ migrated: true });
      }
      if (!window.navo?.issues) return;
      const result = await listMineIssues({ refresh: options.force === true });
      set({ items: result.items, failures: result.failures, fetchedAt: result.fetchedAt, stale: result.stale });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "ISSUE_LOAD_FAILED" });
    } finally {
      set({ loading: false });
    }
  },
}));
