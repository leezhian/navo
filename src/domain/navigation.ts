export type AppSection = "tasks" | "issue" | "settings";

export interface NavigationHistory {
  /** 已访问的一级模块，向后导航时保留前进记录。 */
  entries: AppSection[];
  /** 当前位于历史中的位置。 */
  index: number;
}

export function navigateTo(history: NavigationHistory, section: AppSection): NavigationHistory {
  if (history.entries[history.index] === section) return history;
  return { entries: [...history.entries.slice(0, history.index + 1), section], index: history.index + 1 };
}

export function stepNavigation(history: NavigationHistory, direction: -1 | 1): NavigationHistory {
  const index = Math.max(0, Math.min(history.entries.length - 1, history.index + direction));
  return index === history.index ? history : { ...history, index };
}
