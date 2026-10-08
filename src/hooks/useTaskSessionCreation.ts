import { useEffect, useRef } from "react";
import type { StartTaskSessionInput, TaskSession } from "@/shared/taskSessionTypes";
import { useTaskSessionStore } from "@/stores/taskSessionStore";

/** 统一创建后的选择协调；Agent 和终端各自保留独立的视图操作版本。 */
export function useTaskSessionCreation(taskId: string) {
  const revisions = useRef({ agent: 0, shell: 0 });

  function invalidateSelection(kind: TaskSession["kind"]) {
    revisions.current[kind] += 1;
  }

  useEffect(() => () => {
    // 视图离开后迟到的创建结果仍由 store 保存，但不能再更新这个视图。
    invalidateSelection("agent");
    invalidateSelection("shell");
  }, [taskId]);

  async function startSession(input: Omit<StartTaskSessionInput, "taskId">) {
    const store = useTaskSessionStore.getState();
    if (store.pending) return;
    const revision = ++revisions.current[input.kind];
    const previousIds = new Set(store.sessions.map((session) => session.id));
    await store.start({ ...input, taskId });
    // 创建期间的关闭或选择优先于自动展示新会话。
    if (revision !== revisions.current[input.kind]) return;
    return useTaskSessionStore.getState().sessions.find((session) =>
      session.taskId === taskId && session.kind === input.kind && !previousIds.has(session.id));
  }

  return { startSession, invalidateSelection };
}
