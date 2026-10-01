import { useState } from "react";
import { navigateTo, stepNavigation } from "@/domain/navigation";
import type { AppSection, NavigationHistory } from "@/domain/navigation";

export function useAppNavigation() {
  const [history, setHistory] = useState<NavigationHistory>({ entries: ["tasks"], index: 0 });
  return {
    section: history.entries[history.index],
    canGoBack: history.index > 0,
    canGoForward: history.index < history.entries.length - 1,
    selectSection: (section: AppSection) => setHistory((current) => navigateTo(current, section)),
    goBack: () => setHistory((current) => stepNavigation(current, -1)),
    goForward: () => setHistory((current) => stepNavigation(current, 1)),
  };
}
