import { create } from "zustand";
import { loadIssueItems } from "@/services/adeData";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import { mergeIssueItems, moveIssue } from "@/utils/issueView";

interface IssueStore {
  items: IssueItem[];
  /** 手动排序仅保存在当前窗口，不修改类型或远程平台数据。 */
  move: (issueId: string, group: IssueGroup, beforeIssueId: string | null) => void;
  /** 从现有数据源更新内容，保留仍存在条目的手动顺序。 */
  refresh: () => void;
}

/** Issue 页面与任务关联选择器共享同一份本地条目，不复制页面筛选状态。 */
export const useIssueStore = create<IssueStore>((set) => ({
  items: loadIssueItems(),
  refresh: () => {
    const incoming = loadIssueItems();
    set((state) => ({ items: mergeIssueItems(state.items, incoming) }));
  },
  move: (issueId, group, beforeIssueId) => set((state) => ({
    items: moveIssue(state.items, issueId, group, beforeIssueId),
  })),
}));
