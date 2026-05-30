import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MacWindow, WindowControls } from "./components/layout/MacWindow";
import { ReviewWorkspace } from "./components/review/ReviewWorkspace";
import { SessionSidebar } from "./components/session/SessionSidebar";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { mockSessions } from "./domain/mockData";
import type { CompareMode, CompareModeFileCounts, ReviewSession, ReviewSummary } from "./domain/types";
import { useLocalSettings } from "./hooks/useLocalSettings";
import { loadLocalBranches, loadReviewDiff, mockSummary } from "./services/reviewApi";
import "./App.css";

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

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const orderedSessions = useOrderedSessions(sessions);
  const shouldPlaceWindowControlsInReviewToolbar = !isSessionSidebarVisible && !showSettings && Boolean(selectedSession);

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
    setSessions((current) =>
      current.map((item) => (item.id === session.id ? { ...item, unread: false } : item)),
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <MacWindow
        isSidebarVisible={isSessionSidebarVisible}
        showWindowControls={!shouldPlaceWindowControlsInReviewToolbar}
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
            }}
            onSelectSession={selectSession}
          />

          <AnimatePresence mode="wait" initial={false}>
            {showSettings && (
              <motion.section
                animate={{ opacity: 1, x: 0 }}
                className="min-h-0 min-w-0 flex-1"
                exit={{ opacity: 0, x: 28 }}
                initial={{ opacity: 0, x: 28 }}
                key="settings"
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <SettingsPanel
                  settings={settings}
                  updateSettings={updateSettings}
                  onBack={() => {
                    setShowSettings(false);
                    setSelectedSessionId(mockSessions[0]?.id ?? null);
                  }}
                />
              </motion.section>
            )}

            {!showSettings && selectedSession && (
              <motion.section
                animate={{ opacity: 1, x: 0 }}
                className="min-h-0 min-w-0 flex-1"
                exit={{ opacity: 0, x: 28 }}
                initial={{ opacity: 0, x: 28 }}
                key={`review-${selectedSession.id}`}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
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
                  leadingControls={
                    shouldPlaceWindowControlsInReviewToolbar ? (
                      <WindowControls
                        className="mr-3"
                        isSidebarVisible={isSessionSidebarVisible}
                        onToggleSidebar={() => setIsSessionSidebarVisible((visible) => !visible)}
                      />
                    ) : undefined
                  }
                  onClose={() => setSelectedSessionId(null)}
                  onCompareModeChange={setCompareMode}
                  onRefresh={refreshReview}
                  onSelectedFileChange={setSelectedFileId}
                  onSettingsChange={updateSettings}
                  onToggleAllCollapsed={() => setCollapsedFileIds((current) => toggleAllFiles(current, reviewSummary))}
                  onToggleFile={(fileId) => setCollapsedFileIds((current) => toggleSetValue(current, fileId))}
                />
              </motion.section>
            )}
          </AnimatePresence>
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
