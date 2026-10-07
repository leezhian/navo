import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Folder, FolderOpen, GitBranch, GitFork } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { RESOURCE_DESCRIPTION_MAX_LENGTH } from "@/shared/settingsTypes";
import type { useResourceForm } from "@/hooks/useResourceForm";
import { useResourceGitInfo } from "@/hooks/useResourceGitInfo";
import { ResourceCommands } from "./ResourceCommands";

interface ResourceEditFieldsProps {
  /** 名称、目录、描述和命令均来自同一份未保存的资源草稿。 */
  form: ReturnType<typeof useResourceForm>;
  /** 资源提交或系统目录选择期间禁止修改。 */
  disabled: boolean;
  /** 命令子表单编辑中时阻止父表单提交。 */
  onCommandEditingChange: (editing: boolean) => void;
}

export function ResourceEditFields({ form, disabled, onCommandEditingChange }: ResourceEditFieldsProps) {
  const { t } = useTranslation(["common", "settings"]);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const { info, error } = useResourceGitInfo(form.localPath);
  const remoteText = error ? t("settings:resources.remoteUnavailable") : info?.remoteUrl
    ?? (info ? t(info.isRepository ? "settings:resources.noRemote" : "settings:resources.localFolder") : "—");

  function finishNameEdit() {
    if (nameDraft?.trim()) form.setName(nameDraft.trim());
    setNameDraft(null);
  }

  async function copyPath() {
    setCopyFailed(false);
    setCopiedPath(null);
    try {
      await navigator.clipboard.writeText(form.localPath);
      setCopiedPath(form.localPath);
    } catch { setCopyFailed(true); }
  }

  return <>
    <section className="grid gap-3 pb-4 border-b border-border/60" aria-label={t("settings:resources.editTitle")}>
    <div className="flex min-w-0 items-center gap-3 pr-7">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        {info?.isRepository ? <GitBranch className="size-4" /> : <Folder className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
      {nameDraft === null
        ? <button type="button" data-slot="resource-name" aria-label={t("common:actions.rename")} disabled={disabled} onClick={() => setNameDraft(form.name)} className="-ml-2 h-8 max-w-full truncate rounded-lg px-2 text-left text-base font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" title={form.name}>{form.name}</button>
        : <Input autoFocus className="-ml-2 text-base font-medium md:text-base" data-slot="resource-name-input" aria-label={t("common:fields.name")} disabled={disabled} value={nameDraft} maxLength={100} onChange={(event) => setNameDraft(event.target.value)} onBlur={finishNameEdit}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") { event.preventDefault(); finishNameEdit(); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNameDraft(null); }
          }} />}
      </div>
    </div>
    <div className="grid gap-1 pl-11">
      <div className="flex min-w-0 items-center gap-1">
        <span data-slot="resource-local-path" aria-label={t("settings:resources.localPath")} className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={form.localPath}>{form.localPath}</span>
        <IconTooltip label={t(copiedPath === form.localPath ? "common:feedback.copied" : "common:actions.copyPath")} className="shrink-0" disabled={disabled || !form.localPath} onClick={() => void copyPath()}>{copiedPath === form.localPath ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</IconTooltip>
        <IconTooltip label={t("settings:general.chooseDirectory")} className="shrink-0" disabled={disabled} onClick={() => void form.chooseFolder()}><FolderOpen className="size-3.5" /></IconTooltip>
      </div>
      {copyFailed && <p role="alert" className="text-xs text-destructive">{t("common:errors.operationFailed")}</p>}
      <div data-slot="resource-remote" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" aria-label={t("settings:resources.remoteRepository")}>
        <GitFork className="size-3.5 shrink-0" /><span className="truncate font-mono" title={remoteText}>{remoteText}</span>
      </div>
    </div>
    </section>
    <label className="grid gap-2 text-xs font-medium">{t("settings:resources.description")}
      <Textarea value={form.description} disabled={disabled} onChange={(event) => form.setDescription(event.target.value)} maxLength={RESOURCE_DESCRIPTION_MAX_LENGTH} rows={3} className="max-h-48 min-h-20 resize-y text-xs font-normal md:text-xs" placeholder={t("settings:resources.descriptionPlaceholder")} />
    </label>
    <ResourceCommands commands={form.commands} disabled={disabled} onChange={form.setCommands} onEditingChange={onCommandEditingChange} />
  </>;
}
