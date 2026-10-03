import { create } from "zustand";
import { loadIssueItems } from "@/services/adeData";

/** Issue 页面与任务关联选择器共享同一份本地条目，不复制页面筛选状态。 */
export const useIssueStore = create(() => ({ items: loadIssueItems() }));
