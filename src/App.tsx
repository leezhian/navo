import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MacWindow, WindowWorkspaceTabs, type WindowTerminalTab } from "./components/layout/MacWindow";
import { ReviewWorkspace } from "./components/review/ReviewWorkspace";
import { SessionSidebar } from "./components/session/SessionSidebar";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { TerminalWorkspace } from "./components/terminal/TerminalWorkspace";
import { mockSessions } from "./domain/mockData";
import type { CompareMode, CompareModeFileCounts, ReviewSession, ReviewSummary } from "./domain/types";
import { useLocalSettings } from "./hooks/useLocalSettings";
import { loadLocalBranches, loadReviewDiff, mockSummary } from "./services/reviewApi";
import "./App.css";

type WorkspaceKind = "review" | "terminal";

function App() {
  const { settings, updateSettings } = useLocalSettings();
  const [sessions, setSessions] = useState(mockSessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(mockSessions[0]?.id ?? null);
  const [isSessionSidebarVisible, setIsSessionSidebarVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("previous-session");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [collapsedFileIds, setCollapsedFileIds] = useState<Set<string>>(new Set());
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(mockSummary());
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [localBranches, setLocalBranches] = useState<string[]>(["main", "master"]);
  const [compareModeFileCounts, setCompareModeFileCounts] = useState<CompareModeFileCounts>({});
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKind>("review");
  const [terminalTabs, setTerminalTabs] = useState<WindowTerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const terminalCounterRef = useRef(0);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const orderedSessions = useOrderedSessions(sessions);
  const activeTerminal = terminalTabs.find((tab) => tab.id === activeTerminalId) ?? null;
  const isReviewActive = activeWorkspace === "review" && Boolean(selectedSession);
  const shouldShowWorkspaceTabs = !showSettings && (Boolean(selectedSession) || terminalTabs.length > 0);

  const refreshCompareModeFileCounts = useCallback(() => {
    if (!selectedSession) {
      setCompareModeFileCounts({});
      return;
    }

    loadCompareModeFileCounts(selectedSession.projectPath, settings.targetBranch)
      .then(setCompareModeFileCounts)
      .catch(() => setCompareModeFileCounts({}));
  }, [selectedSession, settings.targetBranch]);

  const refreshReview = useCallback(() => {
    if (!selectedSession) {
      setCompareModeFileCounts({});
      return;
    }

    setIsReviewLoading(true);
    setReviewError(null);
    refreshCompareModeFileCounts();

    loadReviewDiff(selectedSession.projectPath, compareMode, settings.targetBranch)
      .then((summary) => {
        const nextSummary = summary.fileCount > 0 ? summary : mockSummary();
        if (isTrackedFileCountMode(compareMode)) {
          setCompareModeFileCounts((current) => ({ ...current, [compareMode]: summary.fileCount }));
        }

        setReviewSummary(nextSummary);
        setSelectedFileId(nextSummary.files[0]?.id ?? null);
        setCollapsedFileIds(new Set(nextSummary.files.filter((file) => file.isLarge).map((file) => file.id)));
      })
      .catch((error: unknown) => {
        setReviewError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setIsReviewLoading(false);
      });
  }, [compareMode, refreshCompareModeFileCounts, selectedSession, settings.targetBranch]);

  useEffect(() => {
    refreshReview();
  }, [refreshReview]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    loadLocalBranches(selectedSession.projectPath)
      .then(setLocalBranches)
      .catch(() => setLocalBranches(["main", "master"]));
  }, [selectedSession]);

  function selectSession(session: ReviewSession) {
    setSelectedSessionId(session.id);
    setShowSettings(false);
    setActiveWorkspace("review");
    setSessions((current) =>
      current.map((item) => (item.id === session.id ? { ...item, unread: false } : item)),
    );
  }

  function addTerminalTab() {
    terminalCounterRef.current += 1;
    const nextTab = {
      id: `terminal-${Date.now()}-${terminalCounterRef.current}`,
      title: `终端 ${terminalCounterRef.current}`,
    };

    setShowSettings(false);
    setTerminalTabs((current) => [...current, nextTab]);
    setActiveTerminalId(nextTab.id);
    setActiveWorkspace("terminal");
  }

  function closeReviewTab() {
    setSelectedSessionId(null);
    if (terminalTabs.length > 0) {
      setActiveTerminalId((current) => current ?? terminalTabs[0].id);
      setActiveWorkspace("terminal");
    }
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

  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <MacWindow
        isSidebarVisible={isSessionSidebarVisible}
        workspaceTabs={
          shouldShowWorkspaceTabs ? (
            <WindowWorkspaceTabs
              activeTerminalId={activeTerminalId}
              hasReview={Boolean(selectedSession)}
              isReviewActive={isReviewActive}
              terminalTabs={terminalTabs}
              onAddTerminal={addTerminalTab}
              onCloseReview={closeReviewTab}
              onCloseTerminal={closeTerminalTab}
              onSelectReview={() => setActiveWorkspace("review")}
              onSelectTerminal={(tabId) => {
                setActiveTerminalId(tabId);
                setActiveWorkspace("terminal");
              }}
            />
          ) : undefined
        }
        onToggleSidebar={() => setIsSessionSidebarVisible((visible) => !visible)}
      >
        <div className="flex h-full min-w-0">
          <SessionSidebar
            isVisible={isSessionSidebarVisible}
            orderedSessions={orderedSessions}
            selectedSessionId={selectedSessionId}
            onOpenSettings={() => {
              setShowSettings(true);
              setSelectedSessionId(null);
              setActiveWorkspace("review");
            }}
            onSelectSession={selectSession}
          />

          {showSettings && (
            <section className="min-h-0 min-w-0 flex-1">
              <SettingsPanel
                settings={settings}
                updateSettings={updateSettings}
                onBack={() => {
                  setShowSettings(false);
                  setSelectedSessionId(mockSessions[0]?.id ?? null);
                }}
              />
            </section>
          )}

          {!showSettings && selectedSession && activeWorkspace === "review" && (
            <section className="min-h-0 min-w-0 flex-1">
              <ReviewWorkspace
                collapsedFileIds={collapsedFileIds}
                compareMode={compareMode}
                compareModeFileCounts={compareModeFileCounts}
                isLoading={isReviewLoading}
                localBranches={localBranches}
                reviewError={reviewError}
                selectedFileId={selectedFileId}
                session={selectedSession}
                settings={settings}
                summary={reviewSummary}
                onCompareModeChange={setCompareMode}
                onRefresh={refreshReview}
                onSelectedFileChange={setSelectedFileId}
                onSettingsChange={updateSettings}
                onToggleAllCollapsed={() => setCollapsedFileIds((current) => toggleAllFiles(current, reviewSummary))}
                onToggleFile={(fileId) => setCollapsedFileIds((current) => toggleSetValue(current, fileId))}
              />
            </section>
          )}

          {!showSettings && activeTerminal && activeWorkspace === "terminal" && (
            <section className="min-h-0 min-w-0 flex-1">
              <TerminalWorkspace title={activeTerminal.title} />
            </section>
          )}
        </div>
      </MacWindow>
    </main>
  );
}

function useOrderedSessions(sessions: ReviewSession[]) {
  return useMemo(
    () =>
      [...sessions].sort(
        (first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime(),
      ),
    [sessions],
  );
}

function toggleSetValue(source: Set<string>, value: string) {
  const next = new Set(source);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function toggleAllFiles(current: Set<string>, summary: ReviewSummary | null) {
  if (!summary) {
    return current;
  }

  const allFileIds = summary.files.map((file) => file.id);
  const allCollapsed = allFileIds.length > 0 && allFileIds.every((fileId) => current.has(fileId));
  return allCollapsed ? new Set<string>() : new Set(allFileIds);
}

function isTrackedFileCountMode(mode: CompareMode) {
  return mode === "unstaged" || mode === "staged";
}

async function loadCompareModeFileCounts(
  projectPath: string,
  targetBranch: string,
): Promise<CompareModeFileCounts> {
  const [unstagedSummary, stagedSummary] = await Promise.all([
    loadReviewDiff(projectPath, "unstaged", targetBranch),
    loadReviewDiff(projectPath, "staged", targetBranch),
  ]);

  return {
    unstaged: unstagedSummary.fileCount,
    staged: stagedSummary.fileCount,
  };
}

export default App;
