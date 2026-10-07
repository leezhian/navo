import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/useTasks";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import { TaskIssuePickerContent } from "./TaskIssuePickerContent";

interface TaskIssuePickerProps {
  /** 此次选择的条目类别，与 Issue 页共用完整数据集。 */
  group: IssueGroup;
  /** 当前草稿已关联条目，确认前不直接修改它。 */
  selected: IssueItem[];
  onConfirm: (items: IssueItem[]) => void;
  /** 取消丢弃临时选择，关闭后将焦点交回创建表单。 */
  onClose: () => void;
  onReturnFocus: () => void;
}
export function TaskIssuePicker({ group, selected, onConfirm, onClose, onReturnFocus }: TaskIssuePickerProps) {
  const { t } = useTranslation(["common", "taskCreate"]);
  const { loaded } = useTasks();
  const [items, setItems] = useState(selected.filter((item) => item.group === group));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-[920px]" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
      <DialogHeader><DialogTitle>{t(group === "PR" ? "taskCreate:links.addPullRequest" : "taskCreate:links.addIssue")}</DialogTitle></DialogHeader>
      <TaskIssuePickerContent group={group} selected={items} onChange={setItems} />
      <DialogFooter><span className="mr-auto self-center text-xs text-muted-foreground">{t("common:selection.count", { count: items.length })}</span>
        <Button variant="ghost" onClick={onClose}>{t("common:actions.cancel")}</Button>
        <Button disabled={!loaded} onClick={() => onConfirm(items)}>{t("common:actions.confirm")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
