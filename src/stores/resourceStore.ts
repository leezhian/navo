import { create } from "zustand";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { resourceApi } from "@/services/resourceApi";

interface ResourceState {
  records: ResourceRecord[];
  /** 区分首次读取与后台刷新，已加载的空列表也保持稳定展示。 */
  loaded: boolean;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  upsert: (record: ResourceRecord) => void;
  remove: (id: string) => Promise<void>;
}

export const useResourceStore = create<ResourceState>((set, get) => {
  let revision = 0;
  return {
    records: [], loaded: false, loading: false, error: null,
    async refresh() {
      if (get().loading) return;
      set({ loading: true, error: null });
      for (;;) {
        const refreshRevision = revision;
        try {
          const records = await resourceApi.list();
          // 增删改可能在读取期间完成；重新读取完整列表，避免旧快照覆盖新记录或遗漏首次加载的数据。
          if (refreshRevision !== revision) continue;
          set({ records, loaded: true, loading: false, error: null });
        } catch (error) {
          if (refreshRevision !== revision) continue;
          set({ error, loading: false });
        }
        return;
      }
    },
    upsert(record) {
      revision += 1;
      set(({ records }) => ({ records: records.some((item) => item.id === record.id)
        ? records.map((item) => item.id === record.id ? record : item) : [...records, record] }));
    },
    async remove(id) {
      await resourceApi.remove(id);
      revision += 1;
      set(({ records }) => ({ records: records.filter((record) => record.id !== id) }));
    },
  };
});
