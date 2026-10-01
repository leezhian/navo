import { create } from "zustand";
import type { ResourceRecord } from "@/shared/settingsTypes";
import { resourceApi } from "@/services/resourceApi";

interface ResourceState {
  records: ResourceRecord[];
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  upsert: (record: ResourceRecord) => void;
  remove: (id: string) => Promise<void>;
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  records: [], loading: false, error: null,
  async refresh() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try { set({ records: await resourceApi.list(), loading: false }); }
    catch (error) { set({ error, loading: false }); }
  },
  upsert(record) {
    set(({ records }) => ({ records: records.some((item) => item.id === record.id)
      ? records.map((item) => item.id === record.id ? record : item) : [...records, record] }));
  },
  async remove(id) {
    await resourceApi.remove(id);
    set(({ records }) => ({ records: records.filter((record) => record.id !== id) }));
  },
}));
