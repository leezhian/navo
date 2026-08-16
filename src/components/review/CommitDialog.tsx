import { useState } from "react";
import type { ReactNode } from "react";
import { CloudUpload, GitBranch, GitCommitHorizontal, Loader2 } from "lucide-react";
import classNames from "classnames";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { GitCommitStatus } from "@/shared/electronApi";
import { commitGitChanges, pushGitCommits } from "@/services/reviewApi";

type CommitAction = "commit" | "commitAndPush" | "push";

interface CommitDialogProps {
  /** Git 操作作用的项目根路径。 */
  projectPath: string;
  /** 当前提交面板状态，弹窗打开时由上层保证已加载。 */
  status: GitCommitStatus;
  /** 外部动作（直接推送）失败时带入的错误文案。 */
  externalError: string | null;
  /** 任一动作执行结束后触发（无论成败），用于刷新按钮三态。 */
  onStatusChanged: () => void;
  /** 动作成功后关闭弹窗。 */
  onClose: () => void;
}

export function CommitDialog({ projectPath, status, externalError, onStatusChanged, onClose }: CommitDialogProps) {
  const [message, setMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  // 当前高亮动作行：⌘↩ 的触发目标，hover 可用行时跟随移动。
  const [activeAction, setActiveAction] = useState<CommitAction>("commitAndPush");
  const [pendingAction, setPendingAction] = useState<CommitAction | null>(null);
  const [error, setError] = useState<string | null>(externalError);

  const hasCommitScope = status.stagedFileCount > 0 || (includeUnstaged && status.unstagedFileCount > 0);
  const canCommit = message.trim().length > 0 && hasCommitScope && pendingAction === null;
  const isActionEnabled: Record<CommitAction, boolean> = {
    commit: canCommit,
    commitAndPush: canCommit && !status.isDetached,
    push: status.aheadCount > 0 && !status.isDetached && pendingAction === null,
  };
  // 增删统计随「包含未暂存」勾选联动，口径为已跟踪文件。
  const additions = status.stagedAdditions + (includeUnstaged ? status.unstagedAdditions : 0);
  const deletions = status.stagedDeletions + (includeUnstaged ? status.unstagedDeletions : 0);

  async function runAction(action: CommitAction) {
    if (!isActionEnabled[action]) {
      return;
    }

    setPendingAction(action);
    setError(null);

    try {
      if (action !== "push") {
        await commitGitChanges(projectPath, message.trim(), includeUnstaged);
      }
      if (action !== "commit") {
        await pushGitCommits(projectPath);
      }
      onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setPendingAction(null);
      onStatusChanged();
    }
  }

  return (
    <DialogContent
      aria-describedby={undefined}
      className="w-96 gap-0 p-0"
      showCloseButton={false}
      onKeyDown={(keyboardEvent) => {
        // ⌘↩ 等价于点击当前高亮动作行（输入框聚焦时同样生效）。
        if (keyboardEvent.metaKey && keyboardEvent.key === "Enter") {
          keyboardEvent.preventDefault();
          void runAction(activeAction);
        }
      }}
    >
      {/* Radix Dialog 要求提供标题；视觉上分支行已承担标题职责，故仅保留无障碍标题。 */}
      <DialogTitle className="sr-only">提交更改</DialogTitle>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <GitBranch className="size-4 shrink-0" />
          <span className="truncate">{status.branchName}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          {additions > 0 && <span className="text-green-600 dark:text-green-400">+{additions}</span>}
          {deletions > 0 && <span className="text-red-600 dark:text-red-400">-{deletions}</span>}
        </span>
      </div>
      <textarea
        autoFocus
        className="min-h-20 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50"
        placeholder="提交信息"
        rows={3}
        value={message}
        onChange={(changeEvent) => setMessage(changeEvent.target.value)}
      />
      <label className="flex w-fit cursor-pointer items-center gap-2 px-4 pb-3.5 text-sm">
        <Checkbox
          checked={includeUnstaged}
          disabled={status.unstagedFileCount === 0}
          onCheckedChange={(checked) => setIncludeUnstaged(checked === true)}
        />
        包含未暂存的更改
      </label>
      {error && <p className="px-4 pb-3 text-xs break-all text-destructive">{error}</p>}
      <Separator />
      <div className="p-1.5">
        <CommitActionRow
          active={activeAction === "commit"}
          disabled={!isActionEnabled.commit}
          icon={<GitCommitHorizontal className="size-4" />}
          label="提交"
          pending={pendingAction === "commit"}
          onHover={() => setActiveAction("commit")}
          onSelect={() => void runAction("commit")}
        />
        <CommitActionRow
          active={activeAction === "commitAndPush"}
          disabled={!isActionEnabled.commitAndPush}
          icon={<CloudUpload className="size-4" />}
          label="提交并推送"
          pending={pendingAction === "commitAndPush"}
          onHover={() => setActiveAction("commitAndPush")}
          onSelect={() => void runAction("commitAndPush")}
        />
        <CommitActionRow
          active={activeAction === "push"}
          disabled={!isActionEnabled.push}
          icon={<CloudUpload className="size-4" />}
          label="推送"
          pending={pendingAction === "push"}
          onHover={() => setActiveAction("push")}
          onSelect={() => void runAction("push")}
        />
      </div>
    </DialogContent>
  );
}

interface CommitActionRowProps {
  /** 是否为当前高亮行（⌘↩ 的触发目标），高亮时展示快捷键角标。 */
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  /** 执行中以 loading 图标替换动作图标。 */
  pending: boolean;
  /** hover 到可用行时将其设为高亮行。 */
  onHover: () => void;
  onSelect: () => void;
}

function CommitActionRow({ active, disabled, icon, label, pending, onHover, onSelect }: CommitActionRowProps) {
  return (
    <button
      className={classNames(
        "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm",
        disabled ? "cursor-default text-muted-foreground/50" : "text-foreground",
        active && !disabled && "bg-muted",
      )}
      disabled={disabled}
      type="button"
      onClick={onSelect}
      onMouseEnter={() => {
        if (!disabled) {
          onHover();
        }
      }}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
      <span className="flex-1">{label}</span>
      {active && !disabled && (
        <span className="rounded-sm border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">⌘↵</span>
      )}
    </button>
  );
}
