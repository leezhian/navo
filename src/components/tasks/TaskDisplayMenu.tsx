import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import { Columns3, List, SlidersHorizontal } from "lucide-react";
import { Popover, RadioGroup } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TaskDisplayOptions, TaskOrder, TaskViewMode } from "@/domain/taskView";
import { WORKSPACE_OPTIONS_PANEL_CLASS_NAME, WORKSPACE_OPTIONS_SECTION_CLASS_NAME } from "@/components/layout/workspaceOptions";

interface TaskDisplayMenuProps {
  /** 当前视图、排序与元信息显隐。 */
  display: TaskDisplayOptions;
  /** 只修改展示设置，不改变任务元数据或已保存顺序。 */
  onDisplayChange: Dispatch<SetStateAction<TaskDisplayOptions>>;
}

export function TaskDisplayMenu({ display, onDisplayChange }: TaskDisplayMenuProps) {
  const { t: translate } = useTranslation();
  return (
    <Popover.Root>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <Button aria-label={translate("显示选项")} className="workspace-toolbar-button" size="icon" variant="ghost"><SlidersHorizontal aria-hidden="true" className="size-4" /></Button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent>{translate("显示选项")}</TooltipContent>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content aria-label={translate("任务显示选项")} align="end" sideOffset={8}
          className={WORKSPACE_OPTIONS_PANEL_CLASS_NAME + " z-50 max-h-[var(--radix-popover-content-available-height)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"}>
          <RadioGroup.Root aria-label={translate("任务显示方式")} className="flex gap-2" value={display.mode}
            onValueChange={(mode: TaskViewMode) => onDisplayChange((current) => ({ ...current, mode }))}>
            <RadioGroup.Item className="task-view-choice" value="list"><List aria-hidden="true" className="size-4" />{translate("列表")}</RadioGroup.Item>
            <RadioGroup.Item className="task-view-choice" value="board"><Columns3 aria-hidden="true" className="size-4" />{translate("看板")}</RadioGroup.Item>
          </RadioGroup.Root>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{translate("排序")}</span>
            <Select value={display.order} onValueChange={(order: TaskOrder) => onDisplayChange((current) => ({ ...current, order }))}>
              <SelectTrigger aria-label={translate("任务排序")} className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">{translate("自定义顺序")}</SelectItem>
                <SelectItem value="newest">{translate("日期从新到旧")}</SelectItem>
                <SelectItem value="oldest">{translate("日期从旧到新")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{translate("按状态分组。看板在自定义顺序下支持拖拽，日期排序不修改已保存顺序。")}</p>
          <div className={WORKSPACE_OPTIONS_SECTION_CLASS_NAME}>
            <p className="mb-3 text-xs text-muted-foreground">{translate("展示字段")}</p>
            <div className="flex gap-2">
              <Button aria-pressed={display.showDate} className="h-7 rounded-full px-3 text-xs font-normal" variant={display.showDate ? "secondary" : "outline"}
                onClick={() => onDisplayChange((current) => ({ ...current, showDate: !current.showDate }))}>{translate("日期")}</Button>
              <Button aria-pressed={display.showProject} className="h-7 rounded-full px-3 text-xs font-normal" variant={display.showProject ? "secondary" : "outline"}
                onClick={() => onDisplayChange((current) => ({ ...current, showProject: !current.showProject }))}>{translate("项目")}</Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
