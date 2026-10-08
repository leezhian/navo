import { useEffect, useRef, useState } from "react";
import type { AppSettings } from "@/domain/types";
import { createTaskResourceDraft } from "@/domain/taskResourceDraft";
import type { TaskResourceDraft } from "@/domain/taskResourceDraft";
import { getTasksApi } from "@/services/taskApi";

interface ResourceSelection {
  resourceId: string;
  /** 勾选后才探测真实 Git 信息；null 表示该项仍在查询中。 */
  draft: TaskResourceDraft | null;
}

export function useTaskResourceSelection(defaultMode: AppSettings["defaultTaskMode"]) {
  const [selections, setSelections] = useState<ResourceSelection[]>([]);
  const [error, setError] = useState<unknown>(null);
  const requests = useRef(new Map<string, symbol>());
  useEffect(() => {
    const pending = requests.current;
    return () => pending.clear();
  }, []);

  function select(resourceId: string, checked: boolean) {
    if (!checked) {
      requests.current.delete(resourceId);
      setSelections((current) => current.filter((item) => item.resourceId !== resourceId));
      return;
    }
    if (requests.current.has(resourceId)) return;
    const request = Symbol(resourceId);
    requests.current.set(resourceId, request);
    setError(null);
    setSelections((current) => [...current, { resourceId, draft: null }]);
    void getTasksApi().inspectResource(resourceId).then((info) => {
      if (requests.current.get(resourceId) !== request) return;
      const draft = createTaskResourceDraft(info, defaultMode);
      setSelections((current) => current.map((item) => item.resourceId === resourceId ? { resourceId, draft } : item));
    }).catch((failure) => {
      if (requests.current.get(resourceId) !== request) return;
      requests.current.delete(resourceId);
      setSelections((current) => current.filter((item) => item.resourceId !== resourceId));
      setError(failure);
    });
  }

  function update(draft: TaskResourceDraft) {
    setSelections((current) => current.map((item) => item.resourceId === draft.resourceId ? { ...item, draft } : item));
  }
  function reset() {
    requests.current.clear();
    setSelections([]);
    setError(null);
  }

  return { selections, select, update, reset, error, pending: selections.some((item) => item.draft === null) };
}
