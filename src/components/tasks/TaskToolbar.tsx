import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import type { Task } from "@/domain/tasks";
import type { TaskDisplayOptions, TaskFilters } from "@/domain/taskView";
import { TaskDisplayMenu } from "./TaskDisplayMenu";
import { TaskFilterMenu } from "./TaskFilterMenu";

interface TaskToolbarProps {
  /** 完整任务集合，仅用于过滤选项的数量统计。 */
  tasks: Task[];
  /** 筛选条件和显示设置；均只影响 Tasks 面板。 */
  filters: TaskFilters;
  display: TaskDisplayOptions;
  /** 来自任务数据的可选项目。 */
  projectNames: string[];
  /** 是否启用过滤，用于显示右侧重置入口。 */
  hasFilters: boolean;
  /** 更新筛选、展示设置或清除所有条件。 */
  onFiltersChange: Dispatch<SetStateAction<TaskFilters>>;
  onDisplayChange: Dispatch<SetStateAction<TaskDisplayOptions>>;
  onClearFilters: () => void;
}

export function TaskToolbar({ tasks, filters, display, projectNames, hasFilters, onFiltersChange, onDisplayChange, onClearFilters }: TaskToolbarProps) {
  return (
    <div className="workspace-toolbar" role="toolbar" aria-label="任务面板工具栏">
      <div className="ml-auto flex items-center gap-2">
        {hasFilters && <Button className="h-6 px-2 text-xs font-normal text-muted-foreground" size="xs" variant="ghost" onClick={onClearFilters}>重置</Button>}
        <TaskFilterMenu tasks={tasks} filters={filters} projectNames={projectNames} hasFilters={hasFilters} onFiltersChange={onFiltersChange} onClear={onClearFilters} />
        <TaskDisplayMenu display={display} onDisplayChange={onDisplayChange} />
      </div>
    </div>
  );
}
