import { LoaderCircle, Pin, Play, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ContextMenuItem } from "@/components/ui/context-menu";
import type { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { TaskSessionStatus } from "@/shared/taskSessionTypes";

interface WorkspaceCommandMenuItemProps {
  /** 沿用当前菜单的键盘导航，命令与图钉分别是两个菜单操作。 */
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
  /** 仓库命令名称及当前工作区中的运行状态。 */
  name: string;
  activeStatus?: TaskSessionStatus;
  disabled: boolean;
  /** 已固定时图钉可取消默认，正在保存时禁止再次提交。 */
  pinned: boolean;
  savingDefault: boolean;
  /** 点击命令名称时执行或停止对应命令。 */
  onSelectCommand: () => void;
  /** 仅仍保存在资源配置里的命令能被固定。 */
  onToggleDefault?: () => void;
}

export function WorkspaceCommandMenuItem({ Item, name, activeStatus, disabled, pinned, savingDefault, onSelectCommand, onToggleDefault }: WorkspaceCommandMenuItemProps) {
  const { t } = useTranslation(["tasks"]);
  const pinLabel = t(pinned ? "tasks:commands.unpinDefault" : "tasks:commands.pinDefault", { name });
  return <div className="flex items-center gap-0.5" role="presentation">
    <Item className="min-w-0 flex-1" disabled={disabled} title={t(activeStatus ? "tasks:commands.stop" : "tasks:commands.run", { name })} onSelect={onSelectCommand}>
      {activeStatus === "starting" ? <LoaderCircle className="size-3.5 animate-spin" /> : activeStatus ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
      <span className="truncate">{name}</span>
    </Item>
    {onToggleDefault && <Item asChild disabled={disabled || savingDefault} onSelect={(event) => {
      event.preventDefault();
      onToggleDefault();
    }} className="size-6 shrink-0 justify-center p-0 text-muted-foreground data-[pinned=true]:text-primary">
      <button type="button" aria-label={pinLabel} title={pinLabel} data-pinned={pinned}>
        <Pin className={pinned ? "size-3.5 fill-current" : "size-3.5"} />
      </button>
    </Item>}
  </div>;
}
