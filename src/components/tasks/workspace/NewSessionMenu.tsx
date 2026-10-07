import { Folder, GitBranch, Layers, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentId } from "@/shared/agentTypes";
import type { TaskResource } from "@/shared/taskTypes";
import { agentNames } from "@/domain/agents";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { AgentProviderIcon } from "./AgentProviderIcon";

interface NewSessionMenuProps {
  /** 只展示可用 Agent，模型/模式/思考等级由主进程按能力默认值选择。 */
  choices: Array<{ id: AgentId; ready: boolean }>;
  disabled: boolean;
  /** 单目录直达 Agent，多目录先选范围；null 表示全部工作树和文件夹。 */
  resources?: TaskResource[];
  onCreate: (id: AgentId, resourceId?: string | null) => void;
  /** 无会话空态提供带文字入口，其余入口只显示加号。 */
  withLabel?: boolean;
}
export function NewSessionMenu({ choices, disabled, onCreate, withLabel, resources = [] }: NewSessionMenuProps) {
  const { t } = useTranslation(["tasks", "taskCreate"]);
  function agentItems(resourceId?: string | null) {
    return choices.length ? choices.map((choice) => <DropdownMenuItem key={choice.id} className="text-xs" disabled={!choice.ready || disabled} onSelect={() => onCreate(choice.id, resourceId)}>
      <AgentProviderIcon agentId={choice.id} /><span>{agentNames[choice.id]}</span>
    </DropdownMenuItem>) : <DropdownMenuItem disabled className="text-xs">{t("taskCreate:agent.empty")}</DropdownMenuItem>;
  }
  const multiple = resources.length > 1;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      {withLabel ? <Button variant="secondary" size="sm" aria-label={t("tasks:runtime.newSession")} disabled={disabled}>
        <Plus className="size-3.5" />{t("tasks:runtime.newSession")}
      </Button> : <IconTooltip label={t("tasks:runtime.newSession")} size="icon-xs" disabled={disabled}><Plus /></IconTooltip>}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className={multiple ? "w-72" : "w-52"}>
      {multiple ? <>
        <DropdownMenuSub><DropdownMenuSubTrigger className="text-xs"><Layers className="size-3.5" /><span className="min-w-0 flex-1"><span className="block truncate">{t("tasks:runtime.allWorktrees")}</span><span className="block text-[11px] text-muted-foreground">{t("tasks:runtime.allWorktreesDescription")}</span></span></DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent className="w-52">{agentItems(null)}</DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>
        <DropdownMenuSeparator />
        {resources.map((resource) => {
          const title = resource.mode === "folder" ? resource.name : resource.targetBranch || resource.sourceBranch || resource.name;
          return <DropdownMenuSub key={resource.resourceId}><DropdownMenuSubTrigger className="min-w-0 text-xs" title={`${title} · ${resource.name}`}>
            {resource.mode === "folder" ? <Folder className="size-3.5" /> : <GitBranch className="size-3.5" />}<span className="min-w-0 flex-1"><span className="block truncate">{title}</span>{title !== resource.name && <span className="block truncate text-[11px] text-muted-foreground">{resource.name}</span>}</span>
          </DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent className="w-52">{agentItems(resource.resourceId)}</DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>;
        })}
      </> : agentItems(resources[0]?.resourceId)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
