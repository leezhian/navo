import { useCallback, useEffect, useMemo, useState } from "react";
import { MacWindow } from "./components/layout/MacWindow";
import { ReviewWorkspace } from "./components/review/ReviewWorkspace";
import { SessionSidebar } from "./components/session/SessionSidebar";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { mockSessions } from "./domain/mockData";
import type { CompareMode, ReviewSession, ReviewSummary } from "./domain/types";
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

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const orderedSessions = useOrderedSessions(sessions);

  const refreshReview = useCallback(() => {
    if (!selectedSession) {
      return;
    }

    setIsReviewLoading(true);
    setReviewError(null);

    loadReviewDiff(selectedSession.projectPath, compareMode, settings.targetBranch)
      .then((summary) => {
        const nextSummary = summary.fileCount > 0 ? summary : mockSummary();
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
  }, [compareMode, selectedSession, settings.targetBranch]);

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
      <MacWindow>
        <div
          className={
            selectedSession || showSettings
              ? getAppLayoutClassName(isSessionSidebarVisible, true)
              : getAppLayoutClassName(isSessionSidebarVisible, false)
          }
        >
          <SessionSidebar
            isVisible={isSessionSidebarVisible}
            orderedSessions={orderedSessions}
            selectedSessionId={selectedSessionId}
            onOpenSettings={() => {
              setShowSettings(true);
              setSelectedSessionId(null);
            }}
            onSelectSession={selectSession}
            onToggleSidebar={() => setIsSessionSidebarVisible((visible) => !visible)}
          />

          {showSettings && (
            <section className="min-h-0 min-w-0">
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

          {!showSettings && selectedSession && (
            <ReviewWorkspace
              collapsedFileIds={collapsedFileIds}
              compareMode={compareMode}
              isLoading={isReviewLoading}
              localBranches={localBranches}
              reviewError={reviewError}
              selectedFileId={selectedFileId}
              session={selectedSession}
              settings={settings}
              summary={reviewSummary}
              onClose={() => setSelectedSessionId(null)}
              onCompareModeChange={setCompareMode}
              onRefresh={refreshReview}
              onSelectedFileChange={setSelectedFileId}
              onSettingsChange={updateSettings}
              onToggleAllCollapsed={() => setCollapsedFileIds((current) => toggleAllFiles(current, reviewSummary))}
              onToggleFile={(fileId) => setCollapsedFileIds((current) => toggleSetValue(current, fileId))}
            />
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

function getAppLayoutClassName(isSessionSidebarVisible: boolean, hasContent: boolean) {
  if (isSessionSidebarVisible && hasContent) {
    return "grid h-[calc(100%-44px)] grid-cols-[280px_minmax(0,1fr)]";
  }

  if (isSessionSidebarVisible) {
    return "grid h-[calc(100%-44px)] grid-cols-[280px]";
  }

  return hasContent
    ? "grid h-[calc(100%-44px)] grid-cols-[48px_minmax(0,1fr)]"
    : "grid h-[calc(100%-44px)] grid-cols-[48px]";
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

export default App;
