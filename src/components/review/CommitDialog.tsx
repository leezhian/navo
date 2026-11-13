import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CloudUpload, GitBranch, GitCommitHorizontal, Loader2 } from "lucide-react";
import classNames from "classnames";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getCommitStatusCapabilities } from "@/domain/commitStatus";
import { Separator } from "@/components/ui/separator";
import type { GitCommitStatus } from "@/shared/electronApi";
import { commitGitChanges, pushGitCommits } from "@/services/reviewApi";
import { isApplePlatform } from "@/utils/platform";

type CommitAction = "commit" | "commitAndPush" | "push";

const COMMIT_ACTION_ORDER: CommitAction[] = ["commit", "commitAndPush", "push"];

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
  const { t: translate } = useTranslation(["common", "review"]);
  const { hasStagedChanges, hasUnstagedChanges, hasLocalChanges, canPush } = getCommitStatusCapabilities(status);
  const usesAppleShortcut = isApplePlatform();
  const actionShortcutLabel = usesAppleShortcut ? "⌘↵" : "Ctrl+Enter";
  const [message, setMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  // 当前高亮动作行：⌘↩ 或 Ctrl+Enter 的触发目标，默认优先选择普通提交。
  const [activeAction, setActiveAction] = useState<CommitAction>(hasLocalChanges ? "commit" : "push");
  const [pendingAction, setPendingAction] = useState<CommitAction | null>(null);
  const [error, setError] = useState<string | null>(externalError);

  const hasCommitMessage = message.trim().length > 0 && pendingAction === null;
  // 普通提交允许在没有 staged 文件时提交全部本地改动；提交并推送则要求存在可控的 staged 范围。
  const hasCommitScope = hasStagedChanges || (includeUnstaged && hasUnstagedChanges);
  const commitIncludesUnstaged = includeUnstaged || !hasStagedChanges;
  const isActionEnabled: Record<CommitAction, boolean> = {
    commit: hasLocalChanges && hasCommitMessage,
    commitAndPush: hasCommitScope && hasCommitMessage && !status.isDetached,
    push: canPush && pendingAction === null,
  };
  // 增删统计跟随普通提交最终纳入的范围，口径为已跟踪文件。
  const additions = status.stagedAdditions + (commitIncludesUnstaged ? status.unstagedAdditions : 0);
  const deletions = status.stagedDeletions + (commitIncludesUnstaged ? status.unstagedDeletions : 0);

  function moveActiveAction(direction: "up" | "down") {
    const nextAction = getAdjacentEnabledAction(activeAction, direction, isActionEnabled);

    if (nextAction === null || nextAction === activeAction) {
      return false;
    }

    setActiveAction(nextAction);
    return true;
  }

  useEffect(() => {
    setActiveAction((currentAction) => {
      if (!hasLocalChanges) {
        return "push";
      }

      if (currentAction === "commitAndPush" && (!hasCommitScope || status.isDetached)) {
        return "commit";
      }

      if (currentAction === "push" && !canPush) {
        return "commit";
      }

      return currentAction;
    });
  }, [canPush, hasCommitScope, hasLocalChanges, status.isDetached]);

  async function runAction(action: CommitAction) {
    if (!isActionEnabled[action]) {
      return;
    }

    setPendingAction(action);
    setError(null);

    try {
      if (action !== "push") {
        // 没有 staged 文件且仅选择普通提交时，先纳入工作区改动，保证按钮可用且提交能成功执行。
        await commitGitChanges(projectPath, message.trim(), commitIncludesUnstaged);
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
        // macOS 使用 ⌘↩，Windows/Linux 使用 Ctrl+Enter，均执行当前高亮动作。
        const hasPrimaryModifier = usesAppleShortcut
          ? keyboardEvent.metaKey && !keyboardEvent.ctrlKey
          : keyboardEvent.ctrlKey && !keyboardEvent.metaKey;

        if (hasPrimaryModifier && !keyboardEvent.altKey && !keyboardEvent.shiftKey && keyboardEvent.key === "Enter") {
          keyboardEvent.preventDefault();
          void runAction(activeAction);
          return;
        }

        // 输入框聚焦时，上下键用于选择动作；没有可切换动作时保留文本框默认行为。
        if (
          keyboardEvent.target instanceof HTMLTextAreaElement &&
          !keyboardEvent.metaKey &&
          !keyboardEvent.ctrlKey &&
          !keyboardEvent.altKey &&
          !keyboardEvent.shiftKey &&
          (keyboardEvent.key === "ArrowUp" || keyboardEvent.key === "ArrowDown")
        ) {
          const direction = keyboardEvent.key === "ArrowUp" ? "up" : "down";

          if (moveActiveAction(direction)) {
            keyboardEvent.preventDefault();
          }
        }
      }}
    >
      {/* Radix Dialog 要求提供标题；视觉上分支行已承担标题职责，故仅保留无障碍标题。 */}
      <DialogTitle className="sr-only">{translate("review:commit.title")}</DialogTitle>
      <div
        className={classNames(
          "flex items-center gap-2 px-4 pt-3.5 text-sm text-muted-foreground",
          !hasLocalChanges && "pb-3.5",
        )}
      >
        <GitBranch className="size-4 shrink-0" />
        <span className="truncate">{status.branchName}</span>
      </div>
      {hasLocalChanges && (
        <>
          <textarea
            autoFocus
            className="min-h-20 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50"
            placeholder={translate("review:commit.message")}
            rows={3}
            value={message}
            onChange={(changeEvent) => setMessage(changeEvent.target.value)}
          />
          <div className="flex items-center justify-between gap-3 px-4 pb-3.5 text-sm">
            <label className="flex min-w-0 cursor-pointer items-center gap-2">
              {/* 这是提交范围开关，不代表当前是否存在未暂存文件，因此始终允许切换。 */}
              <Checkbox
                checked={includeUnstaged}
                onCheckedChange={(checked) => {
                  const nextIncludeUnstaged = checked === true;
                  setIncludeUnstaged(nextIncludeUnstaged);

                  if (!nextIncludeUnstaged && !hasStagedChanges) {
                    setActiveAction("commit");
                  }
                }}
              />
              <span className="truncate">{translate("review:commit.includeUnstaged")}</span>
            </label>
            <span className="flex shrink-0 items-center gap-1.5 text-xs">
              {additions > 0 && <span className="text-green-600 dark:text-green-400">+{additions}</span>}
              {deletions > 0 && <span className="text-red-600 dark:text-red-400">-{deletions}</span>}
            </span>
          </div>
        </>
      )}
      {error && <p className="px-4 pb-3 text-xs break-all text-destructive">{error}</p>}
      <Separator />
      <div className="p-1.5">
        <CommitActionRow
          active={activeAction === "commit"}
          disabled={!isActionEnabled.commit}
          icon={<GitCommitHorizontal className="size-4" />}
          label={translate("review:commit.submit")}
          pending={pendingAction === "commit"}
          shortcutLabel={actionShortcutLabel}
          onHover={() => setActiveAction("commit")}
          onSelect={() => void runAction("commit")}
        />
        <CommitActionRow
          active={activeAction === "commitAndPush"}
          disabled={!isActionEnabled.commitAndPush}
          icon={<CloudUpload className="size-4" />}
          label={translate("review:commit.submitAndPush")}
          pending={pendingAction === "commitAndPush"}
          shortcutLabel={actionShortcutLabel}
          onHover={() => setActiveAction("commitAndPush")}
          onSelect={() => void runAction("commitAndPush")}
        />
        <CommitActionRow
          active={activeAction === "push"}
          disabled={!isActionEnabled.push}
          icon={<CloudUpload className="size-4" />}
          label={translate("review:commit.push")}
          pending={pendingAction === "push"}
          shortcutLabel={actionShortcutLabel}
          onHover={() => setActiveAction("push")}
          onSelect={() => void runAction("push")}
        />
      </div>
    </DialogContent>
  );
}

/**
 * 按动作顺序寻找下一个可用项，越过禁用动作并在列表两端循环。
 * 返回 null 表示当前状态没有任何可切换的动作。
 */
function getAdjacentEnabledAction(
  currentAction: CommitAction,
  direction: "up" | "down",
  enabledActions: Record<CommitAction, boolean>,
): CommitAction | null {
  const currentIndex = COMMIT_ACTION_ORDER.indexOf(currentAction);
  const step = direction === "up" ? -1 : 1;

  for (let offset = 1; offset <= COMMIT_ACTION_ORDER.length; offset += 1) {
    const nextIndex =
      (currentIndex + step * offset + COMMIT_ACTION_ORDER.length) % COMMIT_ACTION_ORDER.length;
    const nextAction = COMMIT_ACTION_ORDER[nextIndex];

    if (enabledActions[nextAction]) {
      return nextAction;
    }
  }

  return null;
}

interface CommitActionRowProps {
  /** 是否为当前高亮行（⌘↩ 或 Ctrl+Enter 的触发目标），高亮时展示快捷键角标。 */
  active: boolean;
  /** 当前动作是否不可执行。 */
  disabled: boolean;
  /** 动作图标。 */
  icon: ReactNode;
  /** 动作名称。 */
  label: string;
  /** 执行中以 loading 图标替换动作图标。 */
  pending: boolean;
  /** 当前系统对应的执行快捷键文案。 */
  shortcutLabel: string;
  /** hover 到可用行时将其设为高亮行。 */
  onHover: () => void;
  onSelect: () => void;
}

function CommitActionRow({
  active,
  disabled,
  icon,
  label,
  pending,
  shortcutLabel,
  onHover,
  onSelect,
}: CommitActionRowProps) {
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
        <span className="rounded-sm border px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
          {shortcutLabel}
        </span>
      )}
    </button>
  );
}
