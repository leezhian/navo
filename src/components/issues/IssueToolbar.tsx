import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import type { IssueItem } from "@/domain/issues";
import type { IssueDisplayOptions, IssueFilters } from "@/domain/issueView";
import { IssueDisplayMenu } from "./IssueDisplayMenu";
import { IssueFilterMenu } from "./IssueFilterMenu";

interface IssueToolbarProps {
  /** 完整条目集合，用于过滤选项的数量统计。 */
  issues: IssueItem[];
  /** Issue 页面独立的过滤条件与展示设置。 */
  filters: IssueFilters;
  display: IssueDisplayOptions;
  /** 来自完整条目集合的项目选项。 */
  projectNames: string[];
  /** 启用过滤时显示右侧重置入口。 */
  hasFilters: boolean;
  /** 更新过滤及显示选项，不修改原始数据。 */
  onFiltersChange: Dispatch<SetStateAction<IssueFilters>>;
  onDisplayChange: Dispatch<SetStateAction<IssueDisplayOptions>>;
  /** 清空过滤条件，保留显示设置。 */
  onClearFilters: () => void;
}

export function IssueToolbar({ issues, filters, display, projectNames, hasFilters, onFiltersChange, onDisplayChange, onClearFilters }: IssueToolbarProps) {
  return (
    <div className="workspace-toolbar" role="toolbar" aria-label="Issue 列表工具栏">
      <div className="ml-auto flex items-center gap-2">
        {hasFilters && <Button className="h-6 px-2 text-xs font-normal text-muted-foreground" size="xs" variant="ghost" onClick={onClearFilters}>重置</Button>}
        <IssueFilterMenu issues={issues} filters={filters} projectNames={projectNames} hasFilters={hasFilters} onFiltersChange={onFiltersChange} onClear={onClearFilters} />
        <IssueDisplayMenu display={display} onDisplayChange={onDisplayChange} />
      </div>
    </div>
  );
}
