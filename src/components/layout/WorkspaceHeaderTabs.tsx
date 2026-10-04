import { useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Tabs } from "radix-ui";
import { ListTodo, PanelsTopLeft, X } from "lucide-react";
import { MotionConfig, Reorder, useDragControls, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useTaskTabs } from "@/hooks/useTaskTabs";
import type { Task } from "@/domain/tasks";
import type { TaskTabGroup } from "@/domain/taskSplit";
import { TaskTabMenu } from "./TaskTabMenu";

interface WorkspaceHeaderTabsProps {
  /** 进入任务工作区，再激活任务或组合。 */
  onActivateWorkspace: () => void;
}

interface HeaderGroupProps extends WorkspaceHeaderTabsProps {
  /** 拖拽的最小单位；组合的两个成员不可拖散。 */
  group: TaskTabGroup;
  /** 标题始终来自最新任务记录。 */
  taskMap: Map<string, Task>;
  /** 当前获得焦点的任务标识。 */
  activeTaskId: string | null;
  /** 横向拖动边界。 */
  listRef: RefObject<HTMLDivElement | null>;
  /** 仅关闭页面，不删除任务。 */
  onClose: (id: string) => void;
  /** 待选页关闭时恢复原独立标签。 */
  onCancelSplit: (id: string) => void;
}

function HeaderGroup({ group, taskMap, activeTaskId, listRef, onClose, onCancelSplit, onActivateWorkspace }: HeaderGroupProps) {
  const { t } = useTranslation();
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const active = activeTaskId !== null && group.taskIds.includes(activeTaskId);
  const pendingSplit = group.split && !group.split.secondTaskId ? group.split : null;

  return <Reorder.Item as="div" value={group.id} className="navo-tab-group" data-split={Boolean(group.split)} data-active={active} data-dragging={dragging}
    dragControls={controls} dragListener={false} dragConstraints={listRef} dragElastic={0} dragMomentum={false}
    onDragStart={() => setDragging(true)} onDragEnd={() => setDragging(false)} transition={{ duration: reducedMotion ? 0 : 0.18 }}>
    {group.taskIds.map((id) => {
      const task = taskMap.get(id);
      if (!task) return null;
      return <TaskTabMenu key={id} taskId={id} group={group} onActivateWorkspace={onActivateWorkspace}>
        <div className="navo-workspace-tab" data-state={active ? "active" : "inactive"}>
          <Tabs.Trigger className="navo-workspace-tab-trigger" value={id} title={task.title} aria-controls={`task-page-${id}`} draggable={false}
            onPointerDown={(event) => { if (event.button === 0 && event.isPrimary) controls.start(event); }}>
            <ListTodo aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{task.title}</span>
          </Tabs.Trigger>
          <Button aria-label={t("关闭标签：{{title}}", { title: task.title })} className="navo-workspace-tab-close text-muted-foreground hover:text-foreground" size="icon-xs" variant="ghost" onClick={() => onClose(id)}><X aria-hidden="true" className="size-3" /></Button>
        </div>
      </TaskTabMenu>;
    })}
    {pendingSplit && <TaskTabMenu taskId={pendingSplit.firstTaskId} group={group} picker onActivateWorkspace={onActivateWorkspace}>
      <div className="navo-workspace-tab" data-state={active ? "active" : "inactive"}>
        <Tabs.Trigger value={pendingSplit.id} className="navo-workspace-tab-trigger" title={t("选择标签页")} aria-controls={`split-picker-${pendingSplit.id}`}
          onPointerDown={(event) => { if (event.button === 0 && event.isPrimary) controls.start(event); }}>
          <PanelsTopLeft aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{t("选择标签页")}</span>
        </Tabs.Trigger>
        <Button aria-label={t("关闭选择标签页")} className="navo-workspace-tab-close" size="icon-xs" variant="ghost" onClick={() => onCancelSplit(pendingSplit.id)}><X className="size-3" /></Button>
      </div>
    </TaskTabMenu>}
  </Reorder.Item>;
}

export function WorkspaceHeaderTabs({ onActivateWorkspace }: WorkspaceHeaderTabsProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const workspace = useTaskTabs();
  function selectTab(id: string) {
    const pending = workspace.splits.find((split) => split.id === id);
    onActivateWorkspace();
    workspace.activateTask(pending?.firstTaskId ?? id);
  }

  return <MotionConfig reducedMotion="user">
    <Tabs.Root className="min-w-0 flex-1" value={workspace.activeTaskId ?? ""} onValueChange={selectTab}>
      <Tabs.List aria-label={t("工作区标签")} asChild>
        <Reorder.Group ref={listRef} as="div" axis="x" values={workspace.groups.map((group) => group.id)} onReorder={workspace.reorderTasks} layoutScroll className="window-no-drag navo-workspace-tabs">
          {workspace.groups.map((group) => <HeaderGroup key={group.id} group={group} taskMap={workspace.taskMap} activeTaskId={workspace.activeTaskId} listRef={listRef}
            onActivateWorkspace={onActivateWorkspace} onClose={workspace.closeTask} onCancelSplit={workspace.cancelSplit} />)}
        </Reorder.Group>
      </Tabs.List>
    </Tabs.Root>
  </MotionConfig>;
}
