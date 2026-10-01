import type { Dispatch, SetStateAction } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WORKSPACE_OPTIONS_PANEL_CLASS_NAME, WORKSPACE_OPTIONS_SECTION_CLASS_NAME } from "@/components/layout/workspaceOptions";
import type { IssueDisplayOptions, IssueOrder } from "@/domain/issueView";
import { issueDisplayFields } from "./issueConstants";

interface IssueDisplayMenuProps {
  /** 列表排序与字段显隐，标题始终展示。 */
  display: IssueDisplayOptions;
  /** 只更新列表展示，不修改条目元信息或详情字段。 */
  onDisplayChange: Dispatch<SetStateAction<IssueDisplayOptions>>;
}

export function IssueDisplayMenu({ display, onDisplayChange }: IssueDisplayMenuProps) {
  return (
    <Popover.Root>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <Button aria-label="Issue 显示选项" className="workspace-toolbar-button" size="icon" variant="ghost"><SlidersHorizontal aria-hidden="true" className="size-4" /></Button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent>显示选项</TooltipContent>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content aria-label="Issue 显示选项" align="end" sideOffset={8}
          className={WORKSPACE_OPTIONS_PANEL_CLASS_NAME + " z-50 max-h-[var(--radix-popover-content-available-height)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">排序</span>
            <Select value={display.order} onValueChange={(order: IssueOrder) => onDisplayChange((current) => ({ ...current, order }))}>
              <SelectTrigger aria-label="条目排序" className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">默认顺序</SelectItem>
                <SelectItem value="newest">时间从新到旧</SelectItem>
                <SelectItem value="oldest">时间从旧到新</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">按 PR 和 ISSUE 分组，排序只影响列表展示，不修改原始条目顺序。</p>
          <div className={WORKSPACE_OPTIONS_SECTION_CLASS_NAME}>
            <p className="mb-3 text-xs text-muted-foreground">展示字段</p>
            <div className="flex flex-wrap gap-2">
              {issueDisplayFields.map(({ key, label }) => (
                <Button key={key} aria-pressed={display[key]} className="h-7 rounded-full px-3 text-xs font-normal" variant={display[key] ? "secondary" : "outline"}
                  onClick={() => onDisplayChange((current) => ({ ...current, [key]: !current[key] }))}>{label}</Button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
