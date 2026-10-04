import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Columns3, List, SlidersHorizontal } from "lucide-react";
import { Popover, RadioGroup } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WORKSPACE_OPTIONS_PANEL_CLASS_NAME, WORKSPACE_OPTIONS_SECTION_CLASS_NAME } from "@/components/layout/workspaceOptions";
import type { IssueDisplayOptions, IssueOrder, IssueViewMode } from "@/domain/issueView";
import { issueDisplayFields } from "./issueConstants";

interface IssueDisplayMenuProps {
  /** 列表排序与字段显隐，标题始终展示。 */
  display: IssueDisplayOptions;
  /** 只更新列表展示，不修改条目元信息或详情字段。 */
  onDisplayChange: Dispatch<SetStateAction<IssueDisplayOptions>>;
}

export function IssueDisplayMenu({ display, onDisplayChange }: IssueDisplayMenuProps) {
  const { t: translate } = useTranslation();
  return (
    <Popover.Root>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <Button aria-label={translate("Issue 显示选项")} className="workspace-toolbar-button" size="icon" variant="ghost"><SlidersHorizontal aria-hidden="true" className="size-4" /></Button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent>{translate("显示选项")}</TooltipContent>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content aria-label={translate("Issue 显示选项")} align="end" sideOffset={8}
          className={WORKSPACE_OPTIONS_PANEL_CLASS_NAME + " z-50 max-h-[var(--radix-popover-content-available-height)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"}>
          <RadioGroup.Root aria-label={translate("Issue 显示方式")} className="flex gap-2" value={display.mode}
            onValueChange={(mode: IssueViewMode) => onDisplayChange((current) => ({ ...current, mode }))}>
            <RadioGroup.Item className="task-view-choice" value="list"><List aria-hidden="true" className="size-4" />{translate("列表")}</RadioGroup.Item>
            <RadioGroup.Item className="task-view-choice" value="board"><Columns3 aria-hidden="true" className="size-4" />{translate("看板")}</RadioGroup.Item>
          </RadioGroup.Root>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{translate("排序")}</span>
            <Select value={display.order} onValueChange={(order: IssueOrder) => onDisplayChange((current) => ({ ...current, order }))}>
              <SelectTrigger aria-label={translate("条目排序")} className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{translate("自定义顺序")}</SelectItem>
                <SelectItem value="newest">{translate("时间从新到旧")}</SelectItem>
                <SelectItem value="oldest">{translate("时间从旧到新")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{translate("按 PR 和 ISSUE 分组。看板在自定义顺序下支持同类型拖拽，不支持跨类型移动。")}</p>
          <div className={WORKSPACE_OPTIONS_SECTION_CLASS_NAME}>
            <p className="mb-3 text-xs text-muted-foreground">{translate("展示字段")}</p>
            <div className="flex flex-wrap gap-2">
              {issueDisplayFields.map(({ key, label }) => (
                <Button key={key} aria-pressed={display[key]} className="h-7 rounded-full px-3 text-xs font-normal" variant={display[key] ? "secondary" : "outline"}
                  onClick={() => onDisplayChange((current) => ({ ...current, [key]: !current[key] }))}>{translate(label)}</Button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
