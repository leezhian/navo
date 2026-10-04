import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useTaskTabsStore } from "@/stores/taskTabsStore";
import { findTaskSplit, taskTabGroups } from "@/domain/taskSplit";
import type { TaskTabGroup } from "@/domain/taskSplit";

interface TaskTabMenuProps {
  /** 不增加 DOM 包装，保留标签拖动与键盘行为。 */
  children: ReactElement;
  /** 右击的真实任务，选择页使用组合第一任务作为操作目标。 */
  taskId: string;
  /** 标签所属的独立页或双页组合。 */
  group: TaskTabGroup;
  /** 选择页的关闭按钮只取消拆分。 */
  picker?: boolean;
  /** 创建或交换组合前切入任务工作区。 */
  onActivateWorkspace: () => void;
}

export function TaskTabMenu({ children, taskId, group, picker, onActivateWorkspace }: TaskTabMenuProps) {
  const { t } = useTranslation();
  const state = useTaskTabsStore();
  const split = group.split;
  const activeSplit = findTaskSplit(state.splits, state.activeTaskId);
  const combineWithActive = !split && !activeSplit && state.activeTaskId !== null && state.activeTaskId !== taskId;
  const stacked = split?.orientation === "vertical";

  function splitTask() {
    const firstId = combineWithActive ? state.activeTaskId ?? taskId : taskId;
    onActivateWorkspace();
    state.startSplit(firstId, combineWithActive ? taskId : undefined);
  }

  return <ContextMenu>
    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
    <ContextMenuContent updatePositionStrategy="always">
      {split ? <ContextMenuSub>
        <ContextMenuSubTrigger>{t("调整视图")}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => state.cancelSplit(split.id)}>{t("取消拆分视图")}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => state.closeTask(split.firstTaskId)}>{t(stacked ? "关闭上方视图" : "关闭左侧视图")}</ContextMenuItem>
          <ContextMenuItem onSelect={() => split.secondTaskId ? state.closeTask(split.secondTaskId) : state.cancelSplit(split.id)}>{t(stacked ? "关闭下方视图" : "关闭右侧视图")}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => state.setSplitOrientation(split.id, stacked ? "horizontal" : "vertical")}>{t(stacked ? "并排显示" : "堆叠显示")}</ContextMenuItem>
          <ContextMenuItem disabled={!split.secondTaskId} onSelect={() => state.reverseSplit(split.id)}>{t("反转视图")}</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub> : activeSplit ? <ContextMenuSub>
        <ContextMenuSubTrigger>{t("将标签页移至拆分视图")}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => { onActivateWorkspace(); state.swapIntoSplit(activeSplit.id, "first", taskId); }}>{t(activeSplit.orientation === "vertical" ? "与上方视图交换" : "与左侧视图交换")}</ContextMenuItem>
          <ContextMenuItem disabled={!activeSplit.secondTaskId} onSelect={() => { onActivateWorkspace(); state.swapIntoSplit(activeSplit.id, "second", taskId); }}>{t(activeSplit.orientation === "vertical" ? "与下方视图交换" : "与右侧视图交换")}</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub> : <ContextMenuItem onSelect={splitTask}>{t(combineWithActive ? "与当前标签拆分" : "拆分视图")}</ContextMenuItem>}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => picker && split ? state.cancelSplit(split.id) : state.closeTask(taskId)}>{t("关闭")}</ContextMenuItem>
      <ContextMenuItem disabled={taskTabGroups(state.taskIds, state.splits).length < 2} onSelect={() => { onActivateWorkspace(); state.closeOtherTasks(taskId); }}>{t("关闭其他")}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}
