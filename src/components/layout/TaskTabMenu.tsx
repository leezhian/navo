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
  const { t } = useTranslation(["common", "workspace"]);
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
        <ContextMenuSubTrigger>{t("workspace:split.adjust")}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => state.cancelSplit(split.id)}>{t("workspace:split.cancel")}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => state.closeTask(split.firstTaskId)}>{t(stacked ? "workspace:split.closeTop" : "workspace:split.closeLeft")}</ContextMenuItem>
          <ContextMenuItem onSelect={() => split.secondTaskId ? state.closeTask(split.secondTaskId) : state.cancelSplit(split.id)}>{t(stacked ? "workspace:split.closeBottom" : "workspace:split.closeRight")}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => state.setSplitOrientation(split.id, stacked ? "horizontal" : "vertical")}>{t(stacked ? "workspace:split.sideBySide" : "workspace:split.stack")}</ContextMenuItem>
          <ContextMenuItem disabled={!split.secondTaskId} onSelect={() => state.reverseSplit(split.id)}>{t("workspace:split.reverse")}</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub> : activeSplit ? <ContextMenuSub>
        <ContextMenuSubTrigger>{t("workspace:split.moveInto")}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => { onActivateWorkspace(); state.swapIntoSplit(activeSplit.id, "first", taskId); }}>{t(activeSplit.orientation === "vertical" ? "workspace:split.swapTop" : "workspace:split.swapLeft")}</ContextMenuItem>
          <ContextMenuItem disabled={!activeSplit.secondTaskId} onSelect={() => { onActivateWorkspace(); state.swapIntoSplit(activeSplit.id, "second", taskId); }}>{t(activeSplit.orientation === "vertical" ? "workspace:split.swapBottom" : "workspace:split.swapRight")}</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub> : <ContextMenuItem onSelect={splitTask}>{t(combineWithActive ? "workspace:split.withCurrent" : "workspace:split.create")}</ContextMenuItem>}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => picker && split ? state.cancelSplit(split.id) : state.closeTask(taskId)}>{t("common:actions.close")}</ContextMenuItem>
      <ContextMenuItem disabled={taskTabGroups(state.taskIds, state.splits).length < 2} onSelect={() => { onActivateWorkspace(); state.closeOtherTasks(taskId); }}>{t("workspace:tabs.closeOthers")}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}
