import { Bot, ChevronDown } from "lucide-react";
import { Popover } from "radix-ui";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNestedLayerDismiss } from "@/hooks/useNestedLayerDismiss";
import type { useTaskAgentOptions } from "@/hooks/useTaskAgentOptions";
import { agentNames } from "@/domain/agents";
import type { TaskAgentSelection } from "@/shared/agentCapabilities";
import { agentEffortLabel } from "@/utils/taskAgentLabels";
import { TaskAgentOptions } from "./TaskAgentOptions";

interface TaskAgentMenuProps {
  /** 当前草稿配置，用于紧凑回显与完整悬停提示。 */
  value: TaskAgentSelection | null;
  /** 本机认证状态和 CLI 返回的模型、模式、思考等级。 */
  options: ReturnType<typeof useTaskAgentOptions>;
  /** 创建任务时禁用入口，读取能力时允许查看。 */
  disabled: boolean;
  /** 由创建弹窗记录展开状态，避免子菜单关闭时误关创建表单。 */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 配置选择即时回写草稿，不执行任务。 */
  onChange: (selection: TaskAgentSelection) => void;
}

export function TaskAgentMenu({ value, options, disabled, open, onOpenChange, onChange }: TaskAgentMenuProps) {
  const { t } = useTranslation(["taskCreate"]);
  const nestedLayer = useNestedLayerDismiss();
  const summary = value ? [value.modelName, agentEffortLabel(value.effort)].join(" · ") : t("taskCreate:agent.select");
  return <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild><Popover.Trigger asChild><Button type="button" variant="ghost" size="sm" className="min-w-0 border-0 px-0 text-xs font-normal text-muted-foreground hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent" aria-label={t("taskCreate:agent.configure")} disabled={disabled}>
          <Bot className="size-3.5 shrink-0" /><span data-slot="task-agent-summary" className="min-w-0 truncate">{summary}</span>
          {value && <span data-slot="task-agent-mode" className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] leading-4 text-secondary-foreground">{value.modeName}</span>}
          <ChevronDown className="size-3 shrink-0" />
        </Button></Popover.Trigger></TooltipTrigger>
        {!open && <TooltipContent side="top" align="end" sideOffset={6}>
          {value ? <div data-slot="task-agent-details" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <span className="text-background/60">Agent</span><span className="break-words">{agentNames[value.agentId]}</span>
            <span className="text-background/60">{t("taskCreate:agent.model")}</span><span className="break-words">{value.modelName}</span>
            <span className="text-background/60">{t("taskCreate:agent.mode")}</span><span className="break-words">{value.modeName}</span>
            <span className="text-background/60">{t("taskCreate:agent.effort")}</span><span className="break-words">{agentEffortLabel(value.effort)}</span>
          </div> : t("taskCreate:agent.select")}
        </TooltipContent>}
      </Tooltip>
      <Popover.Portal><Popover.Content ref={nestedLayer.setContentRef} onPointerDownOutside={nestedLayer.onPointerDownOutside}
        data-slot="task-agent-menu" aria-label={t("taskCreate:agent.configure")} aria-busy={options.busy} side="top" align="end" sideOffset={6}
        className="z-50 w-[352px] max-w-[calc(100vw-32px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
        <TaskAgentOptions value={value} options={options} onChange={onChange} />
      </Popover.Content></Popover.Portal>
    </Popover.Root>;
}
