import { useEffect, useState } from "react";
import { useTaskStore } from "@/stores/taskStore";
import { useTaskTabsStore } from "@/stores/taskTabsStore";

/** 数据加载完成才接收定位请求；已有标签（含拆分页）直接激活，找不到任务则保留当前页面。 */
export function useTaskLinks(selectTasks: () => void) {
  const loaded = useTaskStore((state) => state.loaded);
  const [error, setError] = useState<"missing" | "failed" | null>(null);
  useEffect(() => {
    const api = window.navo?.app;
    if (!loaded || !api?.onOpenTask) return;
    let disposed = false;
    const unsubscribe = api.onOpenTask((taskId) => {
      if (!useTaskStore.getState().tasks.some((task) => task.id === taskId)) { setError("missing"); return; }
      setError(null);
      selectTasks();
      useTaskTabsStore.getState().openTask(taskId);
    });
    // 先订阅再通知主进程，冷启动链接不会落在监听器注册前的空隙里。
    void api.taskLinksReady().catch(() => { if (!disposed) setError("failed"); });
    return () => { disposed = true; unsubscribe(); };
  }, [loaded, selectTasks]);
  return { error, dismiss: () => setError(null) };
}
