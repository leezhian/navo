import { useEffect, useRef, useState } from "react";
import type { Task } from "@/domain/tasks";
import type { IssueGroup } from "@/domain/issues";
import { getIssueItem } from "@/services/integrationApi";

interface GroupRefreshState {
  busy: boolean;
  failed: number;
}

const initialState = (): Record<IssueGroup, GroupRefreshState> => ({ PR: { busy: false, failed: 0 }, ISSUE: { busy: false, failed: 0 } });

/** 分组只刷新自身关联的远端条目；失败保留原快照，不打开详情或刷新整个账号列表。 */
export function useTaskIssueGroupRefresh(task: Task) {
  const [state, setState] = useState(initialState);
  const generation = useRef(0);
  const running = useRef(new Set<IssueGroup>());
  useEffect(() => {
    generation.current += 1;
    running.current = new Set();
    setState(initialState());
    return () => { generation.current += 1; };
  }, [task.id]);

  const items = [...(task.links ?? []), ...(task.archivedLinks ?? [])].filter((item) => item.providerId && item.source !== "local");
  const available = (group: IssueGroup) => task.status !== "ARCHIVED" && items.some((item) => item.group === group);
  async function refresh(group: IssueGroup) {
    if (!available(group) || running.current.has(group)) return;
    running.current.add(group);
    const current = generation.current;
    const ids = [...new Set(items.filter((item) => item.group === group).map((item) => item.id))];
    setState((value) => ({ ...value, [group]: { busy: true, failed: 0 } }));
    let failed = 0;
    for (let offset = 0; offset < ids.length && generation.current === current; offset += 3) {
      const results = await Promise.allSettled(ids.slice(offset, offset + 3).map((id) => getIssueItem(id, { refresh: true })));
      failed += results.filter((result) => result.status === "rejected" || !result.value || result.value.fetchError).length;
    }
    if (generation.current !== current) return;
    running.current.delete(group);
    setState((value) => ({ ...value, [group]: { busy: false, failed } }));
  }
  return { state, available, refresh };
}
