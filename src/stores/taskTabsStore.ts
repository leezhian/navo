import { create } from "zustand";
import { findTaskSplit, taskTabGroups } from "../domain/taskSplit";
import type { SplitOrientation, SplitSide, TaskSplit } from "../domain/taskSplit";
import { joinTaskOrder, retainTaskTabs } from "../utils/taskTabState";

export interface TaskNoteOpenRequest { taskId: string; noteId: string; sequence: number }
interface TaskTabsState {
  /** 深链携带的笔记定位，仅传递给对应任务标签，序号支持重复定位同一笔记。 */
  noteRequest: TaskNoteOpenRequest | null;
  /** 当前窗口打开的任务，顺序即顶部标签顺序，不跨重启保存。 */
  taskIds: string[];
  /** null 表示正在浏览一级模块，不激活任务页面。 */
  activeTaskId: string | null;
  /** 非嵌套的双页组合，第二页为空时展示选择器。 */
  splits: TaskSplit[];
  /** 新任务追加标签，已打开任务只激活，避免重复页面。 */
  openTask: (taskId: string, noteId?: string) => void;
  /** 仅激活已有标签，返回是否命中，供任务条目决定是否打开侧栏。 */
  activateTask: (taskId: string) => boolean;
  /** 返回一级模块但保留已打开的标签。 */
  showOverview: () => void;
  /** 关闭任务页面，不删除任务或工作目录。 */
  closeTask: (taskId: string) => void;
  /** 仅保留并激活指定的已打开任务。 */
  closeOtherTasks: (taskId: string) => void;
  /** 只接受完整标签组标识的排列，组合整体移动，不拖散成员。 */
  reorderTasks: (taskIds: string[]) => void;
  /** 数据加载完成后，移除已经被删除的任务页面。 */
  retainTasks: (existingIds: string[]) => void;
  /** 从独立标签创建组合，省略第二页时进入选页状态。 */
  startSplit: (firstTaskId: string, secondTaskId?: string) => void;
  /** 为待选组合选择一个未拆分的独立标签。 */
  completeSplit: (splitId: string, taskId: string) => void;
  /** 只拆散组合，不关闭其中的任务页面。 */
  cancelSplit: (splitId: string) => void;
  /** 左右或上下布局，每种方向分别记忆比例。 */
  setSplitOrientation: (splitId: string, orientation: SplitOrientation) => void;
  /** 第一视图比例，限于 5% 至 95%；可视尺寸由布局进一步约束。 */
  setSplitRatio: (splitId: string, ratio: number) => void;
  /** 交换组内页面，不改变当前焦点所属任务。 */
  reverseSplit: (splitId: string) => void;
  /** 与独立标签互换，被换出的页面回到该独立标签原位置。 */
  swapIntoSplit: (splitId: string, side: SplitSide, taskId: string) => void;
}

export const useTaskTabsStore = create<TaskTabsState>((set, get) => ({
  noteRequest: null,
  taskIds: [],
  activeTaskId: null,
  splits: [],
  openTask(taskId, noteId) {
    set((state) => ({ taskIds: state.taskIds.includes(taskId) ? state.taskIds : [...state.taskIds, taskId], activeTaskId: taskId,
      noteRequest: noteId ? { taskId, noteId, sequence: (state.noteRequest?.sequence ?? 0) + 1 } : null }));
  },
  activateTask(taskId) {
    if (!get().taskIds.includes(taskId)) return false;
    set({ activeTaskId: taskId });
    return true;
  },
  showOverview: () => set({ activeTaskId: null }),
  closeTask(taskId) {
    set((state) => {
      if (!state.taskIds.includes(taskId)) return state;
      return retainTaskTabs(state, state.taskIds.filter((id) => id !== taskId));
    });
  },
  closeOtherTasks(taskId) {
    const state = get();
    if (!state.taskIds.includes(taskId)) return;
    const split = findTaskSplit(state.splits, taskId);
    set({ taskIds: split ? [split.firstTaskId, ...(split.secondTaskId ? [split.secondTaskId] : [])] : [taskId], splits: split ? [split] : [], activeTaskId: taskId });
  },
  reorderTasks(taskIds) {
    const groups = taskTabGroups(get().taskIds, get().splits);
    if (taskIds.length !== groups.length || new Set(taskIds).size !== groups.length || taskIds.some((id) => !groups.some((group) => group.id === id))) return;
    set({ taskIds: taskIds.flatMap((id) => groups.find((group) => group.id === id)?.taskIds ?? []) });
  },
  retainTasks(existingIds) {
    set((state) => retainTaskTabs(state, existingIds));
  },
  startSplit(firstTaskId, secondTaskId) {
    const state = get();
    if (!state.taskIds.includes(firstTaskId) || findTaskSplit(state.splits, firstTaskId)) return;
    if (secondTaskId && (secondTaskId === firstTaskId || !state.taskIds.includes(secondTaskId) || findTaskSplit(state.splits, secondTaskId))) return;
    const split: TaskSplit = { id: `split-${crypto.randomUUID()}`, firstTaskId, secondTaskId: secondTaskId ?? null, orientation: "horizontal", ratios: { horizontal: 0.5, vertical: 0.5 } };
    set({ splits: [...state.splits, split], taskIds: secondTaskId ? joinTaskOrder(state.taskIds, firstTaskId, secondTaskId) : state.taskIds, activeTaskId: firstTaskId });
  },
  completeSplit(splitId, taskId) {
    const state = get();
    const split = state.splits.find((item) => item.id === splitId);
    if (!split || split.secondTaskId || !state.taskIds.includes(taskId) || findTaskSplit(state.splits, taskId)) return;
    set({ splits: state.splits.map((item) => item.id === splitId ? { ...item, secondTaskId: taskId } : item), taskIds: joinTaskOrder(state.taskIds, split.firstTaskId, taskId), activeTaskId: taskId });
  },
  cancelSplit: (splitId) => set((state) => ({ splits: state.splits.filter((split) => split.id !== splitId) })),
  setSplitOrientation: (splitId, orientation) => set((state) => ({ splits: state.splits.map((split) => split.id === splitId ? { ...split, orientation } : split) })),
  setSplitRatio(splitId, ratio) {
    if (!Number.isFinite(ratio)) return;
    set((state) => ({ splits: state.splits.map((split) => split.id === splitId ? { ...split, ratios: { ...split.ratios, [split.orientation]: Math.max(0.05, Math.min(0.95, ratio)) } } : split) }));
  },
  reverseSplit(splitId) {
    const state = get();
    const split = state.splits.find((item) => item.id === splitId);
    if (!split?.secondTaskId) return;
    const firstTaskId = split.secondTaskId;
    const secondTaskId = split.firstTaskId;
    set({ splits: state.splits.map((item) => item.id === splitId ? { ...item, firstTaskId, secondTaskId } : item), taskIds: state.taskIds.map((id) => id === firstTaskId ? secondTaskId : id === secondTaskId ? firstTaskId : id) });
  },
  swapIntoSplit(splitId, side, taskId) {
    const state = get();
    const split = state.splits.find((item) => item.id === splitId);
    const replacedId = side === "first" ? split?.firstTaskId : split?.secondTaskId;
    if (!split || !replacedId || !state.taskIds.includes(taskId) || findTaskSplit(state.splits, taskId)) return;
    set({
      taskIds: state.taskIds.map((id) => id === taskId ? replacedId : id === replacedId ? taskId : id),
      splits: state.splits.map((item) => item.id === splitId ? { ...item, [side === "first" ? "firstTaskId" : "secondTaskId"]: taskId } : item),
      activeTaskId: taskId,
    });
  },
}));
