import { useRef, useState } from "react";
import type { WindowTerminalTab } from "@/components/layout/MacWindow";

type WorkspaceKind = "review" | "terminal";

interface UseWorkspaceTabsParams {
  /** 当前是否还有可展示的审查页，用来判断审查 tab 是否有效。 */
  hasReview: boolean;
}

/**
 * 管理顶部工作区 tab 的轻量状态。
 * 审查数据仍由 useReviewData 维护，这里只关心 tab 的增删和激活关系。
 */
export function useWorkspaceTabs({ hasReview }: UseWorkspaceTabsParams) {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKind>("review");
  const [terminalTabs, setTerminalTabs] = useState<WindowTerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const terminalCounterRef = useRef(0);

  const activeTerminal = terminalTabs.find((tab) => tab.id === activeTerminalId) ?? null;
  const isReviewActive = activeWorkspace === "review" && hasReview;
  const hasWorkspaceTabs = hasReview || terminalTabs.length > 0;

  function selectReviewWorkspace() {
    setActiveWorkspace("review");
  }

  function selectTerminalWorkspace(tabId: string) {
    setActiveTerminalId(tabId);
    setActiveWorkspace("terminal");
  }

  function addTerminalTab() {
    terminalCounterRef.current += 1;
    const nextTab = {
      id: `terminal-${Date.now()}-${terminalCounterRef.current}`,
      title: `终端 ${terminalCounterRef.current}`,
    };

    setTerminalTabs((current) => [...current, nextTab]);
    selectTerminalWorkspace(nextTab.id);
  }

  function closeReviewWorkspace() {
    if (terminalTabs.length === 0) {
      return;
    }

    setActiveTerminalId((current) => current ?? terminalTabs[0].id);
    setActiveWorkspace("terminal");
  }

  function closeTerminalTab(tabId: string) {
    setTerminalTabs((current) => {
      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (tabId !== activeTerminalId) {
        return nextTabs;
      }

      const nextActiveTerminal = nextTabs[nextTabs.length - 1] ?? null;
      setActiveTerminalId(nextActiveTerminal?.id ?? null);
      setActiveWorkspace(nextActiveTerminal ? "terminal" : "review");
      return nextTabs;
    });
  }

  return {
    activeTerminal,
    activeTerminalId,
    activeWorkspace,
    hasWorkspaceTabs,
    isReviewActive,
    terminalTabs,
    addTerminalTab,
    closeReviewWorkspace,
    closeTerminalTab,
    selectReviewWorkspace,
    selectTerminalWorkspace,
  };
}
