import { create } from "zustand";
import type { SetStateAction } from "react";
import { defaultSettings, normalizeAppSettings } from "@/domain/settings";
import type { AppSettings } from "@/domain/types";
import i18n from "@/i18n";
import { settingsApi } from "@/services/settingsApi";

interface SettingsState {
  settings: AppSettings;
  logFilePath: string;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  loadError: unknown;
  saveError: unknown;
  bootstrap: () => Promise<void>;
  update: (action: SetStateAction<AppSettings>) => void;
  retrySave: () => void;
}

let writeQueue: Promise<void> = Promise.resolve();
let revision = 0;

export const useSettingsStore = create<SettingsState>((set, get) => {
  function persist(settings: AppSettings) {
    const currentRevision = ++revision;
    set({ saving: true, saveError: null });
    writeQueue = writeQueue.then(async () => {
      try {
        const savedSettings = await settingsApi.save(settings);
        if (revision === currentRevision) set({ settings: savedSettings, saving: false, saveError: null });
      } catch (error) {
        if (revision === currentRevision) set({ saving: false, saveError: error });
      }
    });
  }

  return {
    settings: defaultSettings, logFilePath: "", loaded: false, loading: false,
    saving: false, loadError: null, saveError: null,
    async bootstrap() {
      if (get().loaded || get().loading) return;
      set({ loading: true, loadError: null });
      try {
        const bootstrap = await settingsApi.load();
        let settings = bootstrap.settings;
        if (!settings) {
          const legacy = localStorage.getItem("navo-settings") ?? localStorage.getItem("vibe-reviewer-settings");
          try {
            const parsed = legacy ? JSON.parse(legacy) : defaultSettings;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("INVALID_SETTINGS");
            settings = normalizeAppSettings(parsed);
          }
          catch { throw new Error("INVALID_SETTINGS"); }
          // 迁移成功后才清理旧配置；主进程 SQLite 是唯一持久化来源。
          settings = await settingsApi.save(settings);
          localStorage.removeItem("navo-settings");
          localStorage.removeItem("vibe-reviewer-settings");
        }
        await i18n.changeLanguage(settings.locale);
        set({ settings, logFilePath: bootstrap.logFilePath, loaded: true, loading: false });
      } catch (loadError) {
        set({ loading: false, loadError });
      }
    },
    update(action) {
      if (!get().loaded) return;
      const settings = normalizeAppSettings(typeof action === "function" ? action(get().settings) : action);
      set({ settings });
      void i18n.changeLanguage(settings.locale);
      persist(settings);
    },
    retrySave() { persist(get().settings); },
  };
});
