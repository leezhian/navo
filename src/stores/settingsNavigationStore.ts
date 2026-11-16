import { create } from "zustand";
import type { IntegrationProviderId } from "@/shared/integrationTypes";

export type SettingsPage = "general" | "notifications" | "appearance" | "agents" | "resources" | "integrations" | "labs" | "about";

interface SettingsNavigationState {
  page: SettingsPage;
  highlightProvider: IntegrationProviderId | null;
  openIntegrations: (provider?: IntegrationProviderId) => void;
  setPage: (page: SettingsPage) => void;
  clearHighlight: () => void;
}

export const useSettingsNavigationStore = create<SettingsNavigationState>((set) => ({
  page: "general",
  highlightProvider: null,
  openIntegrations(provider) {
    set({ page: "integrations", highlightProvider: provider ?? null });
  },
  setPage(page) { set({ page }); },
  clearHighlight() { set({ highlightProvider: null }); },
}));
