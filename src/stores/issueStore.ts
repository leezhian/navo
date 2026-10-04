import { create } from "zustand";
import { loadIssueItems } from "@/services/adeData";
import type { IssueItem } from "@/domain/issues";

interface IssueStore {
  items: IssueItem[];
  /** 重新读取数据源；组内展示顺序由页面排序设置决定。 */
  refresh: () => void;
}

/** Issue 页面与任务关联选择器共享同一份本地条目，不复制页面筛选状态。 */
export const useIssueStore = create<IssueStore>((set) => ({
  items: loadIssueItems(),
  refresh: () => set({ items: loadIssueItems() }),
}));
