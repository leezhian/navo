import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SettingsTextFieldProps {
  /** 设置项的无障碍名称。 */
  label: string;
  /** 已提交的值，外部更新后同步输入草稿。 */
  value: string;
  /** 异步操作期间禁用输入，避免路径变更与文件操作冲突。 */
  disabled?: boolean;
  /** 按所在设置区调整输入宽度等展示样式。 */
  className?: string;
  /** 失焦或 Enter 时提交，避免把半输入路径持久化。 */
  onCommit: (value: string) => void;
}

export function SettingsTextField({ label, value, disabled = false, className, onCommit }: SettingsTextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <Input aria-label={label} title={value} disabled={disabled} className={cn("h-8 w-52 bg-background text-xs shadow-none", className)} value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => { if (draft !== value) { onCommit(draft); setDraft(value); } }}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}
