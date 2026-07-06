import { useCallback, useEffect, useMemo, useState } from "react";
import { MacWindow, WindowWorkspaceTabs } from "./components/layout/MacWindow";
import { ReviewWorkspace } from "./components/review/ReviewWorkspace";
import { SessionSidebar } from "./components/session/SessionSidebar";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { TerminalWorkspace } from "./components/terminal/TerminalWorkspace";
import { mockSessions } from "./domain/mockData";
import { mergeLoadedSessions } from "./domain/reviewSessionMerge";
import type { ReviewSession } from "./domain/types";
import { useLocalSettings } from "./hooks/useLocalSettings";
import { useReviewData } from "./hooks/useReviewData";
import { useWorkspaceTabs } from "./hooks/useWorkspaceTabs";
import { loadReviewSessions, markReviewSessionRead, onReviewSessionsChanged } from "./services/reviewApi";
import "./App.css";

function App() {
  const { resolvedTheme, settings, updateSettings } = useLocalSettings();
  const [sessions, setSessions] = useState(mockSessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(mockSessions[0]?.id ?? null);
  const [isSessionSidebarVisible, setIsSessionSidebarVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const toggleSessionSidebar = useCallback(() => {
    setIsSessionSidebarVisible((visible) => !visible);
  }, []);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const orderedSessions = useOrderedSessions(sessions);
  const {
    activeTerminal,
    activeTerminalId,
    activeWorkspace,
    addTerminalTab,
    closeReviewWorkspace,
    closeTerminalTab,
    hasWorkspaceTabs,
    isReviewActive,
    selectReviewWorkspace,
    selectTerminalWorkspace,
    terminalTabs,
  } = useWorkspaceTabs({ hasReview: Boolean(selectedSession) });
  const {
    collapsedFileIds,
    compareMode,
    compareModeFileCounts,
    localBranches,
    refreshReview,
    reviewError,
    reviewSummary,
    runBatchFileAction,
    runFileAction,
    selectedFileId,
    setCompareMode,
    setSelectedFileId,
    toggleAllCollapsed,
    toggleFileCollapsed,
  } = useReviewData({ selectedSession, targetBranch: settings.targetBranch });
  const shouldShowWorkspaceTabs = !showSettings && hasWorkspaceTabs;
  const applyLoadedSessions = useCallback((loadedSessions: ReviewSession[]) => {
    setSessions((currentSessions) => mergeLoadedSessions(currentSessions, loadedSessions));
    setSelectedSessionId((currentId) => {
      if (currentId && loadedSessions.some((session) => session.id === currentId)) {
        return currentId;
      }

      return loadedSessions[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onReviewSessionsChanged((loadedSessions) => {
      if (isMounted) {
        applyLoadedSessions(loadedSessions);
      }
    });

    loadReviewSessions()
      .then((loadedSessions) => {
        if (isMounted) {
          applyLoadedSessions(loadedSessions);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [applyLoadedSessions]);

  function selectSession(session: ReviewSession) {
    setSelectedSessionId(session.id);
    setShowSettings(false);
    selectReviewWorkspace();
    setSessions((current) =>
      current.map((item) => (item.id === session.id ? { ...item, unread: false } : item)),
    );
    markReviewSessionRead(session).catch(() => undefined);
  }

  function openTerminalTab() {
    setShowSettings(false);
    addTerminalTab();
  }

  function closeReviewTab() {
    setSelectedSessionId(null);
    closeReviewWorkspace();
  }

  return (
    <main className="min-h-screen bg-transparent text-foreground">
      <MacWindow
        isSidebarVisible={isSessionSidebarVisible}
        workspaceTabs={
          shouldShowWorkspaceTabs ? (
            <WindowWorkspaceTabs
              activeTerminalId={activeTerminalId}
              hasReview={Boolean(selectedSession)}
              isReviewActive={isReviewActive}
              terminalTabs={terminalTabs}
              onAddTerminal={openTerminalTab}
              onCloseReview={closeReviewTab}
              onCloseTerminal={closeTerminalTab}
              onSelectReview={selectReviewWorkspace}
              onSelectTerminal={selectTerminalWorkspace}
            />
          ) : undefined
        }
        onToggleSidebar={toggleSessionSidebar}
      >
        <div className="flex h-full min-w-0">
          <SessionSidebar
            isVisible={isSessionSidebarVisible}
            orderedSessions={orderedSessions}
            selectedSessionId={selectedSessionId}
            onOpenSettings={() => {
              setShowSettings(true);
            }}
            onSelectSession={selectSession}
          />

          {!showSettings && selectedSession && activeWorkspace === "review" && (
            <section className="min-h-0 min-w-0 flex-1 bg-background">
              <ReviewWorkspace
                collapsedFileIds={collapsedFileIds}
                compareMode={compareMode}
                compareModeFileCounts={compareModeFileCounts}
                localBranches={localBranches}
                reviewError={reviewError}
                resolvedTheme={resolvedTheme}
                selectedFileId={selectedFileId}
                session={selectedSession}
                settings={settings}
                summary={reviewSummary}
                onBatchFileAction={runBatchFileAction}
                onCompareModeChange={setCompareMode}
                onFileAction={runFileAction}
                onRefresh={refreshReview}
                onSelectedFileChange={setSelectedFileId}
                onSettingsChange={updateSettings}
                onToggleAllCollapsed={toggleAllCollapsed}
                onToggleFile={toggleFileCollapsed}
              />
            </section>
          )}

          {!showSettings && activeTerminal && activeWorkspace === "terminal" && (
            <section className="min-h-0 min-w-0 flex-1 bg-background">
              <TerminalWorkspace title={activeTerminal.title} />
            </section>
          )}
        </div>

        {showSettings && (
          <section className="absolute inset-0 z-40 bg-background">
            <SettingsPanel
              settings={settings}
              resolvedTheme={resolvedTheme}
              updateSettings={updateSettings}
              onBack={() => {
                setShowSettings(false);
              }}
            />
          </section>
        )}
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

export default App;
