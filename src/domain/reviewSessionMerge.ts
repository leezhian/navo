import type { ReviewSession } from "./types";

export function mergeLoadedSessions(
  currentSessions: ReviewSession[],
  loadedSessions: ReviewSession[],
): ReviewSession[] {
  const currentSessionsById = new Map(currentSessions.map((session) => [session.id, session]));

  return loadedSessions.map((loadedSession) => {
    const currentSession = currentSessionsById.get(loadedSession.id);

    if (!currentSession || currentSession.updatedAt !== loadedSession.updatedAt) {
      return loadedSession;
    }

    // 本地已读状态由界面即时维护；服务端轮询数据未变化时复用对象引用，避免触发审查区重拉 diff。
    return currentSession;
  });
}
