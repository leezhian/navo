import type { ReactNode } from "react";
import { Folder, GitBranch, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskResource } from "@/shared/taskTypes";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface NewTerminalMenuProps {
  /** 仅允许从当前任务已关联的仓库和文件夹中选择。 */
  resources?: TaskResource[];
  /** 启动过程中禁用入口及目录选项，避免重复创建。 */
  disabled: boolean;
  /** 传资源标识，由主进程解析实际工作目录；无资源时使用默认任务目录。 */
  onCreate: (resourceId?: string) => void;
  /** 多目录时可替换默认加号入口，用于顶部终端按钮和下拉箭头。 */
  trigger?: ReactNode;
}

export function NewTerminalMenu({ resources = [], disabled, onCreate, trigger }: NewTerminalMenuProps) {
  const { t } = useTranslation(["tasks"]);
  if (resources.length <= 1) return <IconTooltip label={t("tasks:runtime.newTerminal")} size="icon-xs" disabled={disabled} onClick={() => onCreate(resources[0]?.resourceId)}><Plus /></IconTooltip>;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>{trigger ?? <IconTooltip label={t("tasks:runtime.newTerminal")} size="icon-xs" disabled={disabled}><Plus /></IconTooltip>}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
      <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">{t("tasks:runtime.newTerminalIn")}</DropdownMenuLabel>
      {resources.map((resource) => {
        const isFolder = resource.mode === "folder";
        const title = isFolder ? resource.name : resource.targetBranch || resource.sourceBranch || resource.name;
        return <DropdownMenuItem key={resource.resourceId} className="min-w-0 gap-2 text-xs" disabled={disabled} title={`${title} · ${resource.name}`} onSelect={() => onCreate(resource.resourceId)}>
          {isFolder ? <Folder className="size-3.5" /> : <GitBranch className="size-3.5" />}
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {!isFolder && <span className="max-w-[35%] truncate text-[11px] text-muted-foreground">{resource.name}</span>}
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}
