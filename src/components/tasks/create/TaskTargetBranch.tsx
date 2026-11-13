import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface TaskTargetBranchProps {
  /** 已确认的目标分支；空值保留自动生成规则。 */
  value: string;
  /** 保存或探测资源期间禁用编辑操作。 */
  disabled: boolean;
  /** 仅确认编辑时提交，取消不改变已保存的值。 */
  onConfirm: (value: string) => void;
}

export function TaskTargetBranch({ value, disabled, onConfirm }: TaskTargetBranchProps) {
  const { t } = useTranslation(["common", "taskCreate"]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      triggerRef.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing]);

  function close() {
    restoreFocus.current = true;
    setEditing(false);
  }

  function confirm() {
    if (disabled) return;
    onConfirm(draft.trim());
    close();
  }

  if (!editing) return <Button ref={triggerRef} type="button" variant="outline" disabled={disabled}
    className="h-8 max-w-48 text-xs" aria-label={t("taskCreate:branches.target")} title={value || "Branch Name"}
    onClick={() => { setDraft(value); setEditing(true); }}>
    <span className="truncate">{value || "Branch Name"}</span>
  </Button>;

  return <div data-task-branch-editor data-slot="task-branch-editor"
    className="flex h-8 shrink-0 items-center rounded-lg border border-input bg-background pr-1 focus-within:relative focus-within:z-10 focus-within:ring-2 focus-within:ring-ring/50 dark:bg-input/30"
    onKeyDown={(event) => {
      if (disabled || event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); confirm(); }
    }}>
    <Input autoFocus aria-label={t("taskCreate:branches.target")} disabled={disabled} value={draft}
      size={Math.min(32, Math.max(16, draft.length + 1))}
      className="h-full w-auto flex-none rounded-none border-0 bg-transparent font-mono text-xs focus-visible:ring-0 md:text-xs dark:bg-transparent"
      onChange={(event) => setDraft(event.target.value)} />
    <IconTooltip label={t("taskCreate:branches.cancelEdit")} disabled={disabled} size="icon-xs" onClick={close}><X className="size-3" /></IconTooltip>
    <IconTooltip label={t("taskCreate:branches.confirmName")} disabled={disabled} size="icon-xs" onClick={confirm}><Check className="size-3" /></IconTooltip>
  </div>;
}
