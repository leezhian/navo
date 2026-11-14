import { useCallback, useEffect, useRef, useState } from "react";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskSessionStore } from "@/stores/taskSessionStore";
import { useTaskTabsStore } from "@/stores/taskTabsStore";
import { blockTaskLink, type TaskLinkTarget } from "@/shared/taskLinks";

export type TaskLinkError = "missing" | "noteMissing" | "sessionMissing" | "failed";

const TASK_LINK_ERROR_KEY = {
  missing: "tasks:taskLink.missing",
  noteMissing: "tasks:notes.notFound",
  sessionMissing: "tasks:taskLink.sessionMissing",
  failed: "tasks:taskLink.failed",
} as const;

export function taskLinkErrorKey(error: TaskLinkError) {
  return TASK_LINK_ERROR_KEY[error];
}

/** 数据加载完成才接收定位请求；已有标签（含拆分页）直接激活。找不到任务或会话时保留当前页面。 */
export function useTaskLinks(selectTasks: () => void) {
  const tasksLoaded = useTaskStore((state) => state.loaded);
  const sessionsLoaded = useTaskSessionStore((state) => state.loaded);
  const [error, setError] = useState<TaskLinkError | null>(null);
  const pending = useRef<TaskLinkTarget | null>(null);
  const openTarget = useCallback((target: TaskLinkTarget) => {
    const tasks = useTaskStore.getState();
    const sessions = useTaskSessionStore.getState();
    const blocked = blockTaskLink(target, tasks.tasks.find((task) => task.id === target.taskId), sessions.loaded, sessions.sessions);
    if (blocked === "wait") { pending.current = target; return; }
    pending.current = null;
    if (blocked) { setError(blocked); return; }
    setError(null);
    selectTasks();
    useTaskTabsStore.getState().openTask(target.taskId, target.noteId, target.sessionId);
  }, [selectTasks]);
  useEffect(() => {
    const api = window.navo?.app;
    if (!tasksLoaded || !api?.onOpenTask) return;
    let disposed = false;
    const unsubscribe = api.onOpenTask((target) => openTarget(target));
    // 先订阅再通知主进程，冷启动链接不会落在监听器注册前的空隙里。
    void api.taskLinksReady().catch(() => { if (!disposed) setError("failed"); });
    return () => { disposed = true; unsubscribe(); };
  }, [tasksLoaded, openTarget]);
  useEffect(() => {
    if (sessionsLoaded && pending.current) openTarget(pending.current);
  }, [sessionsLoaded, openTarget]);
  return { error, dismiss: () => setError(null) };
}
