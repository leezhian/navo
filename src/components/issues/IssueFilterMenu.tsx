import type { Dispatch, SetStateAction } from "react";
import { Circle, Folder, Layers, ListFilter, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WORKSPACE_OPTIONS_PANEL_CLASS_NAME, WORKSPACE_OPTIONS_SECTION_CLASS_NAME } from "@/components/layout/workspaceOptions";
import type { IssueItem } from "@/domain/issues";
import type { IssueFilters } from "@/domain/issueView";
import { issueGroups, issueStatuses, issueStatusOptions, issueTags, issueTagOptions } from "./issueConstants";

interface IssueFilterMenuProps {
  /** 完整条目用于统计各选项数量，不受当前过滤影响。 */
  issues: IssueItem[];
  /** 仅作用于 Issue 页面，不与 Tasks 共享条件。 */
  filters: IssueFilters;
  /** 从完整条目提取的可选项目。 */
  projectNames: string[];
  /** 过滤标记与重置按钮的启用状态。 */
  hasFilters: boolean;
  /** 更新多选条件；选择后保持菜单打开。 */
  onFiltersChange: Dispatch<SetStateAction<IssueFilters>>;
  /** 清除所有过滤条件，不修改展示设置。 */
  onClear: () => void;
}

interface IssueFilterSectionProps<Value extends string> {
  /** 一级菜单名称和图标，子菜单仅显示文字、数量及选中标记。 */
  label: string;
  icon: LucideIcon;
  /** 选项值、中文名称与基于完整集合的数量。 */
  options: { value: Value; label: string; count: number }[];
  /** 当前维度的多选值。 */
  selectedValues: Value[];
  /** 切换单个值，不影响其他过滤维度。 */
  onToggle: (value: Value) => void;
}

function IssueFilterSection<Value extends string>({ label, icon: Icon, options, selectedValues, onToggle }: IssueFilterSectionProps<Value>) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2 px-2 py-2 text-xs"><Icon aria-hidden="true" />{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-64 w-56 overflow-y-auto rounded-xl p-2 shadow-md">
        {options.map(({ value, label: optionLabel, count }) => (
          <DropdownMenuCheckboxItem key={value} className="py-2 text-xs" checked={selectedValues.includes(value)}
            onSelect={(event) => event.preventDefault()} onCheckedChange={() => onToggle(value)}>
            <span className="truncate">{optionLabel}</span>
            <span className="ml-auto text-xs text-muted-foreground">{count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {options.length === 0 && <DropdownMenuItem disabled>暂无选项</DropdownMenuItem>}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function toggleValue<Value extends string>(values: Value[], value: Value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function IssueFilterMenu({ issues, filters, projectNames, hasFilters, onFiltersChange, onClear }: IssueFilterMenuProps) {
  const groupOptions = issueGroups.map((group) => ({ value: group, label: group, count: issues.filter((issue) => issue.group === group).length }));
  const statusOptions = issueStatusOptions.map((status) => ({ value: status, label: issueStatuses[status], count: issues.filter((issue) => issue.status === status).length }));
  const projectOptions = projectNames.map((project) => ({ value: project, label: project, count: issues.filter((issue) => issue.projectName === project).length }));
  const tagOptions = issueTagOptions.map((tag) => ({ value: tag, label: issueTags[tag], count: issues.filter((issue) => issue.tag === tag).length }));

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button aria-label="过滤条目" className="workspace-toolbar-button" data-active={hasFilters} size="icon" variant="ghost">
              <ListFilter aria-hidden="true" className="size-4" />
              {hasFilters && <span className="workspace-filter-indicator" aria-hidden="true" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>过滤条目</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className={WORKSPACE_OPTIONS_PANEL_CLASS_NAME} sideOffset={8}>
        <IssueFilterSection label="分组" icon={Layers} selectedValues={filters.groups}
          options={groupOptions}
          onToggle={(group) => onFiltersChange((current) => ({ ...current, groups: toggleValue(current.groups, group) }))} />
        <IssueFilterSection label="状态" icon={Circle} selectedValues={filters.statuses}
          options={statusOptions}
          onToggle={(status) => onFiltersChange((current) => ({ ...current, statuses: toggleValue(current.statuses, status) }))} />
        <IssueFilterSection label="项目" icon={Folder} selectedValues={filters.projects}
          options={projectOptions}
          onToggle={(project) => onFiltersChange((current) => ({ ...current, projects: toggleValue(current.projects, project) }))} />
        <IssueFilterSection label="标签" icon={Tag} selectedValues={filters.tags}
          options={tagOptions}
          onToggle={(tag) => onFiltersChange((current) => ({ ...current, tags: toggleValue(current.tags, tag) }))} />
        <div className={WORKSPACE_OPTIONS_SECTION_CLASS_NAME}>
          <div className="flex justify-end">
            <DropdownMenuItem className="px-2 py-1.5 text-xs text-muted-foreground" disabled={!hasFilters} onSelect={onClear}>重置</DropdownMenuItem>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
