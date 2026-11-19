import { create } from "zustand";
import { navigateTo, stepNavigation } from "@/domain/navigation";
import type { AppSection, NavigationHistory } from "@/domain/navigation";
import { useTaskTabsStore } from "@/stores/taskTabsStore";

interface AppNavigationState {
  history: NavigationHistory;
  section: AppSection;
  canGoBack: boolean;
  canGoForward: boolean;
  selectSection: (section: AppSection) => void;
  selectTasks: () => void;
  goBack: () => void;
  goForward: () => void;
}

export const useAppNavigationStore = create<AppNavigationState>((set, get) => ({
  history: { entries: ["tasks"], index: 0 },
  section: "tasks",
  canGoBack: false,
  canGoForward: false,
  selectSection(section) {
    useTaskTabsStore.getState().showOverview();
    const history = navigateTo(get().history, section);
    set({
      history,
      section: history.entries[history.index],
      canGoBack: history.index > 0,
      canGoForward: history.index < history.entries.length - 1,
    });
  },
  selectTasks() { get().selectSection("tasks"); },
  goBack() {
    useTaskTabsStore.getState().showOverview();
    const history = stepNavigation(get().history, -1);
    set({
      history,
      section: history.entries[history.index],
      canGoBack: history.index > 0,
      canGoForward: history.index < history.entries.length - 1,
    });
  },
  goForward() {
    useTaskTabsStore.getState().showOverview();
    const history = stepNavigation(get().history, 1);
    set({
      history,
      section: history.entries[history.index],
      canGoBack: history.index > 0,
      canGoForward: history.index < history.entries.length - 1,
    });
  },
}));
