import { useState } from "react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import type { IssueItem } from "@/domain/issues";
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu";
import { TaskResourceMenu } from "./TaskResourceMenu";
import { ensureIssueNote, worktreesForPullRequest } from "@/services/integrationApi";
import { issuePlatformName, isSafeHttpUrl } from "@/utils/issueActions";

interface TaskIssueMenuProps {
  task: Task;
  item: IssueItem;
  archived?: boolean;
  children: ReactElement;
  onOpen: () => void;
  onRefresh?: () => void;
  onGoWorktree?: (resourceId: string) => void;
  onRestore?: () => void;
  onArchive?: () => void;
}

/** PR/Issue 侧栏与资源窗口共用：打开、复制、刷新、解除关联、正文笔记与 Worktree 跳转。 */
export function TaskIssueMenu({ task, item, archived = false, children, onOpen, onRefresh, onGoWorktree, onRestore, onArchive }: TaskIssueMenuProps) {
  const { t } = useTranslation(["issues", "common", "tasks"]);
  const [worktrees, setWorktrees] = useState<{ resourceId: string; name: string; branch: string }[] | null>(null);
  const [noteStatus, setNoteStatus] = useState<"created" | "exists" | "failed" | null>(null);
  const platform = issuePlatformName(item);
  const readOnly = task.status === "ARCHIVED" || archived;
  const canOpen = isSafeHttpUrl(item.url);
  const canCopyNumber = Boolean(item.number?.trim());
  const canCopyBranch = item.group === "PR" && Boolean(item.headBranch?.trim());

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); } catch { /* ignore */ }
  }

  async function loadWorktrees() {
    if (!onGoWorktree || item.group !== "PR") return;
    try { setWorktrees(await worktreesForPullRequest(task.id, item.id)); }
    catch { setWorktrees([]); }
  }

  async function generateNote() {
    try {
      const result = await ensureIssueNote(task.id, item.id);
      setNoteStatus(result === "created" || result === "exists" ? result : "failed");
    } catch { setNoteStatus("failed"); }
  }

  const url = item.url ?? "";
  const number = item.number ?? "";
  const headBranch = item.headBranch ?? "";
  const actions = <>
    {canOpen && platform && <ContextMenuItem onSelect={onOpen}>{t("issues:menu.openIn", { platform })}</ContextMenuItem>}
    {canOpen && item.url && <ContextMenuItem onSelect={() => void copy(url)}>{t("issues:menu.copyLink")}</ContextMenuItem>}
    <ContextMenuItem onSelect={() => void copy(item.title)}>{t("issues:menu.copyTitle")}</ContextMenuItem>
    {canCopyNumber && item.number && <ContextMenuItem onSelect={() => void copy(number)}>{t("issues:menu.copyNumber")}</ContextMenuItem>}
    {canCopyBranch && item.headBranch && <ContextMenuItem onSelect={() => void copy(headBranch)}>{t("issues:menu.copyBranch")}</ContextMenuItem>}
    {!readOnly && onRefresh && <ContextMenuItem onSelect={() => onRefresh()}>{t("issues:menu.refresh")}</ContextMenuItem>}
    {!readOnly && item.group === "ISSUE" && item.source !== "local" && <ContextMenuItem onSelect={() => void generateNote()}>{t("issues:menu.generateNote")}</ContextMenuItem>}
    {item.group === "PR" && onGoWorktree && <ContextMenuSub onOpenChange={(open) => { if (open) void loadWorktrees(); }}>
      <ContextMenuSubTrigger disabled={worktrees !== null && worktrees.length === 0} title={worktrees?.length === 0 ? t("issues:menu.goWorktreeNone") : undefined}>{t("issues:menu.goWorktree")}</ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {(worktrees ?? []).map((worktree) => <ContextMenuItem key={worktree.resourceId} onSelect={() => onGoWorktree(worktree.resourceId)}>{worktree.name} · {worktree.branch}</ContextMenuItem>)}
        {worktrees === null && <ContextMenuItem disabled>{t("common:actions.refresh")}</ContextMenuItem>}
        {worktrees?.length === 0 && <ContextMenuItem disabled>{t("issues:menu.goWorktreeNone")}</ContextMenuItem>}
      </ContextMenuSubContent>
    </ContextMenuSub>}
    {noteStatus && <ContextMenuItem disabled>{noteStatus === "created" ? t("issues:menu.noteCreated") : noteStatus === "exists" ? t("issues:menu.noteExists") : t("issues:menu.noteFailed")}</ContextMenuItem>}
  </>;

  return <TaskResourceMenu task={task} resource={{ kind: "issue", id: item.id }} onArchive={onArchive} onRestore={onRestore}
    actions={<>{actions}<ContextMenuSeparator /></>}>{children}</TaskResourceMenu>;
}
