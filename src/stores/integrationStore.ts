import { create } from "zustand";
import type { IntegrationAuthSession, IntegrationConnectResult, IntegrationProviderId, IntegrationStatus, IntegrationTokenCheck } from "@/shared/integrationTypes";
import {
  cancelIntegration, connectIntegration, disconnectIntegration, integrationAuthState, loadIntegrationStatuses, onIntegrationsChanged, refreshIntegrationStatuses,
} from "@/services/integrationApi";

interface IntegrationState {
  providers: IntegrationStatus[];
  loading: boolean;
  connectingId: IntegrationProviderId | null;
  authSession: IntegrationAuthSession | null;
  authError: string | null;
  tokenCheck: IntegrationTokenCheck | null;
  highlightId: IntegrationProviderId | null;
  refresh: () => Promise<void>;
  refreshStatuses: () => Promise<void>;
  connect: (id: IntegrationProviderId, options?: { method?: "oauth" | "pat"; token?: string; host?: string }) => Promise<IntegrationConnectResult | undefined>;
  cancel: () => Promise<void>;
  disconnect: (id: IntegrationProviderId) => Promise<void>;
  pollAuth: (id: IntegrationProviderId) => Promise<void>;
  setHighlight: (id: IntegrationProviderId | null) => void;
  clearAuth: () => void;
}

let subscribed = false;

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  providers: [],
  loading: false,
  connectingId: null,
  authSession: null,
  authError: null,
  tokenCheck: null,
  highlightId: null,
  async refresh() {
    if (get().loading) return;
    set({ loading: true });
    try {
      if (!subscribed && window.navo?.integrations) {
        subscribed = true;
        onIntegrationsChanged(() => { void get().refresh(); });
      }
      if (window.navo?.integrations) set({ providers: await loadIntegrationStatuses() });
    } catch { /* 主进程不可用时保留现有状态 */ } finally {
      set({ loading: false });
    }
  },
  async refreshStatuses() {
    set({ loading: true });
    try { set({ providers: await refreshIntegrationStatuses() }); }
    finally { set({ loading: false }); }
  },
  async connect(id, options = {}) {
    set({ connectingId: id, authError: null, tokenCheck: null });
    try {
      const method = options.method ?? (options.token ? "pat" : "oauth");
      const result = method === "pat"
        ? await connectIntegration({ id, method: "pat", token: options.token ?? "", host: options.host })
        : await connectIntegration({ id, method: "oauth" });
      if (result.kind === "pat") {
        set({ providers: await loadIntegrationStatuses(), connectingId: null, authSession: null, tokenCheck: result.check });
        return result;
      }
      set({ authSession: result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "INTEGRATION_FAILED";
      set({ authError: message, connectingId: null, authSession: null });
      throw error;
    }
  },
  async cancel() {
    const id = get().connectingId ?? get().authSession?.id;
    if (id) await cancelIntegration(id);
    set({ connectingId: null, authSession: null });
  },
  async disconnect(id) {
    await disconnectIntegration(id);
    set({ providers: await loadIntegrationStatuses() });
  },
  async pollAuth(id) {
    const state = await integrationAuthState(id);
    if (state.session) set({ authSession: state.session, authError: null });
    if (state.error) set({ authError: state.error, authSession: null, connectingId: null });
    if (!state.session && !state.error) {
      const providers = await loadIntegrationStatuses();
      const connected = providers.find((item) => item.id === id)?.connected;
      if (connected) set({ providers, connectingId: null, authSession: null, authError: null });
      else set({ providers });
    }
  },
  setHighlight(id) { set({ highlightId: id }); },
  clearAuth() { set({ authSession: null, authError: null, tokenCheck: null, connectingId: null }); },
}));
