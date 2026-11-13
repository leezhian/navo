import { BrowserWindow } from "electron";
import { watch, type FSWatcher } from "node:fs";
import { ipcChannels } from "../../shared/ipcChannels";
import { ensureReviewStorage, loadReviewSessions } from "./reviewStorage";

const REVIEW_SESSION_CHANGE_DEBOUNCE_MS = 120;
const WATCHED_REVIEW_STORAGE_FILES = new Set(["events.jsonl", "sessions.json"]);

let reviewStorageWatcher: FSWatcher | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

export async function startReviewSessionWatcher() {
  const paths = await ensureReviewStorage();
  stopReviewSessionWatcher();

  reviewStorageWatcher = watch(paths.rootDir, { persistent: false }, (_eventType, fileName) => {
    if (!fileName || !WATCHED_REVIEW_STORAGE_FILES.has(fileName.toString())) {
      return;
    }

    scheduleReviewSessionBroadcast();
  });
}

export function stopReviewSessionWatcher() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  reviewStorageWatcher?.close();
  reviewStorageWatcher = null;
}

function scheduleReviewSessionBroadcast() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    broadcastReviewSessions().catch(() => undefined);
  }, REVIEW_SESSION_CHANGE_DEBOUNCE_MS);
}

async function broadcastReviewSessions() {
  const sessions = await loadReviewSessions();

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.reviewSessionsChanged, sessions);
    }
  }
}
