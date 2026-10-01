import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Circle, Folder, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/domain/tasks";
import type { TaskFilters } from "@/domain/taskView";
import { WORKSPACE_OPTIONS_PANEL_CLASS_NAME, WORKSPACE_OPTIONS_SECTION_CLASS_NAME } from "@/components/layout/workspaceOptions";
import { taskColumns } from "./taskConstants";

interface TaskFilterMenuProps {
  /** 完整任务用于统计选项条目数量，不受当前筛选条件影响。 */
  tasks: Task[];
  /** 当前状态与项目条件。 */
  filters: TaskFilters;
  /** 可选项目从已有任务提取，不提供虚构的远程选项。 */
  projectNames: string[];
  /** 是否启用过滤，用于按钮标记和重置操作状态。 */
  hasFilters: boolean;
  /** 更新条件，多选时保持菜单打开。 */
  onFiltersChange: Dispatch<SetStateAction<TaskFilters>>;
  /** 一次清除全部条件。 */
  onClear: () => void;
}

function toggleValue<Value extends string>(values: Value[], value: Value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function TaskFilterMenu({ tasks, filters, projectNames, hasFilters, onFiltersChange, onClear }: TaskFilterMenuProps) {
  const { t: translate } = useTranslation();
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button aria-label={translate("过滤任务")} className="workspace-toolbar-button" data-active={hasFilters} size="icon" variant="ghost">
              <ListFilter aria-hidden="true" className="size-4" />
              {hasFilters && <span className="workspace-filter-indicator" aria-hidden="true" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{translate("过滤任务")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className={WORKSPACE_OPTIONS_PANEL_CLASS_NAME} sideOffset={8}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 px-2 py-2 text-xs"><Circle aria-hidden="true" />{translate("状态")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52 rounded-xl p-2 shadow-md">
            {taskColumns.map(({ status }) => (
              <DropdownMenuCheckboxItem key={status} className="py-2 text-xs" checked={filters.statuses.includes(status)} onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onFiltersChange((current) => ({ ...current, statuses: toggleValue(current.statuses, status) }))}>
                {status}
                <span className="ml-auto text-xs text-muted-foreground">{tasks.filter((task) => task.status === status).length}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 px-2 py-2 text-xs"><Folder aria-hidden="true" />{translate("项目")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-64 w-56 overflow-y-auto rounded-xl p-2 shadow-md">
            {projectNames.map((projectName) => (
              <DropdownMenuCheckboxItem key={projectName} className="py-2 text-xs" checked={filters.projects.includes(projectName)} onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onFiltersChange((current) => ({ ...current, projects: toggleValue(current.projects, projectName) }))}>
                <span className="truncate">{projectName}</span>
                <span className="ml-auto text-xs text-muted-foreground">{tasks.filter((task) => task.projectName === projectName).length}</span>
              </DropdownMenuCheckboxItem>
            ))}
            {projectNames.length === 0 && <DropdownMenuItem disabled>{translate("暂无项目")}</DropdownMenuItem>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <div className={WORKSPACE_OPTIONS_SECTION_CLASS_NAME}>
          <div className="flex justify-end">
            <DropdownMenuItem className="px-2 py-1.5 text-xs text-muted-foreground" disabled={!hasFilters} onSelect={onClear}>{translate("重置")}</DropdownMenuItem>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
