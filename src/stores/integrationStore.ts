import { create } from "zustand";
import type { IntegrationStatus } from "@/shared/settingsTypes";
import { loadIntegrationStatuses } from "@/services/integrationApi";

interface IntegrationState {
  providers: IntegrationStatus[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  providers: [], loading: false,
  async refresh() {
    if (get().loading) return;
    set({ loading: true });
    try { set({ providers: await loadIntegrationStatuses() }); }
    finally { set({ loading: false }); }
  },
}));
