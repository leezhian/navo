import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, CircleDot, ListTodo, Plus, Settings } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppSection } from "@/domain/navigation";
import { MacWindow } from "./MacWindow";
import { WorkspaceHeaderTabs } from "./WorkspaceHeaderTabs";

interface ApplicationShellProps {
  /** 当前选中的一级模块，设置入口固定在导航底部。 */
  section: AppSection;
  /** 模块内容，在窗口拖动区之外展示。 */
  children: ReactNode;
  /** 历史导航边界，禁用不可执行的方向。 */
  canGoBack: boolean;
  canGoForward: boolean;
  /** 切换 Tasks、Issue 或设置，不触发浏览器页面导航。 */
  onSelectSection: (section: AppSection) => void;
  /** 顶部后退与前进操作。 */
  onGoBack: () => void;
  onGoForward: () => void;
  /** 打开任务创建弹窗，不自动生成任务标签页。 */
  onCreateTask: () => void;
}

interface RailButtonProps {
  /** 当前模块是否已激活。 */
  active: boolean;
  /** 图标按钮的可访问名称与悬浮提示。 */
  label: string;
  /** 使用统一的 lucide 图标。 */
  icon: LucideIcon;
  /** 点击后切换一级模块。 */
  onClick: () => void;
}

function RailButton({ active, label, icon: Icon, onClick }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} aria-pressed={active} className="navo-rail-button" data-active={active} size="icon" variant="ghost" onClick={onClick}>
          <Icon aria-hidden="true" size={18} strokeWidth={1.65} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ApplicationShell({ section, children, canGoBack, canGoForward, onSelectSection, onGoBack, onGoForward, onCreateTask }: ApplicationShellProps) {
  const { t: translate } = useTranslation(["common", "workspace", "taskCreate", "settings", "tasks", "issues"]);
  return (
    <MacWindow headerActions={
      <>
        <nav className="window-no-drag flex shrink-0 items-center gap-1" aria-label={translate("workspace:navigation.history")}>
          <Button aria-label={translate("common:actions.back")} className="size-7 text-muted-foreground" disabled={!canGoBack} size="icon" variant="ghost" onClick={onGoBack}><ArrowLeft aria-hidden="true" size={17} /></Button>
          <Button aria-label={translate("common:actions.forward")} className="size-7 text-muted-foreground" disabled={!canGoForward} size="icon" variant="ghost" onClick={onGoForward}><ArrowRight aria-hidden="true" size={17} /></Button>
        </nav>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <WorkspaceHeaderTabs onActivateWorkspace={() => onSelectSection("tasks")} />
          <IconTooltip label={translate("taskCreate:actions.open")} className="window-no-drag size-7 shrink-0" variant="ghost" onClick={onCreateTask}><Plus className="size-4" /></IconTooltip>
        </div>
      </>
    }>
      <div className="navo-window-body">
        <nav className="navo-navigation-rail" aria-label={translate("workspace:navigation.label")}>
          <div className="flex flex-col gap-2">
            <RailButton active={section === "tasks"} label="Tasks" icon={ListTodo} onClick={() => onSelectSection("tasks")} />
            <RailButton active={section === "issue"} label="Issue" icon={CircleDot} onClick={() => onSelectSection("issue")} />
          </div>
          <div className="mt-auto"><RailButton active={section === "settings"} label={translate("settings:title")} icon={Settings} onClick={() => onSelectSection("settings")} /></div>
        </nav>
        <main className="navo-main-workspace" aria-label={section === "tasks" ? translate("tasks:board.label") : section === "issue" ? translate("issues:page.label") : translate("settings:title")}>{children}</main>
      </div>
    </MacWindow>
  );
}
