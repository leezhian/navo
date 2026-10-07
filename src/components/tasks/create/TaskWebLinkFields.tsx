import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { TASK_LINK_TITLE_MAX_LENGTH, TASK_LINK_URL_MAX_LENGTH } from "@/utils/taskWebLinks";

interface TaskWebLinkFieldsProps {
  /** 创建任务及添加资源窗口共用字段，URL 必填、标题可选。 */
  url: string;
  title: string;
  onUrlChange: (url: string) => void;
  onTitleChange: (title: string) => void;
  invalid?: boolean;
  errorId?: string;
  descriptionId?: string;
  disabled?: boolean;
}
export function TaskWebLinkFields({ url, title, onUrlChange, onTitleChange, invalid, errorId, descriptionId, disabled }: TaskWebLinkFieldsProps) {
  const { t } = useTranslation(["taskCreate", "common"]);
  return <>
    <label className="grid gap-1.5 text-xs">{t("taskCreate:webLinks.url")}
      <Input autoFocus required disabled={disabled} type="url" value={url} maxLength={TASK_LINK_URL_MAX_LENGTH} placeholder="https://" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} className="h-8 text-xs" onChange={(event) => onUrlChange(event.target.value)} />
    </label>
    <label className="grid gap-1.5 text-xs">{t("common:fields.title")}
      <Input disabled={disabled} value={title} placeholder={t("taskCreate:webLinks.titlePlaceholder")} maxLength={TASK_LINK_TITLE_MAX_LENGTH} className="h-8 text-xs" onChange={(event) => onTitleChange(event.target.value)} />
    </label>
    {invalid && <p id={errorId} role="alert" className="text-xs text-destructive">{t("taskCreate:webLinks.invalidUrl")}</p>}
    <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">{t("taskCreate:webLinks.description")}</p>
  </>;
}
