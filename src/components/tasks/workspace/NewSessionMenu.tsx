import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentId } from "@/shared/agentTypes";
import { agentNames } from "@/domain/agents";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentProviderIcon } from "./AgentProviderIcon";

interface NewSessionMenuProps {
  /** 只展示可用 Agent，模型/模式/思考等级由主进程按能力默认值选择。 */
  choices: Array<{ id: AgentId; ready: boolean }>;
  disabled: boolean;
  onCreate: (id: AgentId) => void;
  /** 无会话空态提供带文字入口，其余入口只显示加号。 */
  withLabel?: boolean;
}
export function NewSessionMenu({ choices, disabled, onCreate, withLabel }: NewSessionMenuProps) {
  const { t } = useTranslation(["tasks", "taskCreate"]);
  return <DropdownMenu>
    <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild>
      <Button variant={withLabel ? "secondary" : "ghost"} size={withLabel ? "sm" : "icon-xs"} aria-label={t("tasks:runtime.newSession")} disabled={disabled}>
        <Plus className="size-3.5" />{withLabel && t("tasks:runtime.newSession")}
      </Button>
    </DropdownMenuTrigger></TooltipTrigger><TooltipContent>{t("tasks:runtime.newSession")}</TooltipContent></Tooltip>
    <DropdownMenuContent align="end" className="w-52">
      {choices.map((choice) => <DropdownMenuItem key={choice.id} className="text-xs" disabled={!choice.ready || disabled} onSelect={() => onCreate(choice.id)}>
        <AgentProviderIcon agentId={choice.id} /><span>{agentNames[choice.id]}</span>
      </DropdownMenuItem>)}
      {!choices.length && <DropdownMenuItem disabled className="text-xs">{t("taskCreate:agent.empty")}</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
