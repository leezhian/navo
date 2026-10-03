import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useIssueStore } from "@/stores/issueStore";
import type { IssueGroup, IssueItem } from "@/domain/issues";
import { issueStatuses } from "@/components/issues/issueConstants";
import { formatDate } from "@/i18n";

interface TaskIssuePickerProps {
  /** 此次选择的条目类别，与 Issue 页共用完整数据集。 */
  group: IssueGroup;
  /** 当前草稿已关联条目，确认前不直接修改它。 */
  selected: IssueItem[];
  /** 确认后替换该类别的选择，另一类别不受影响。 */
  onConfirm: (items: IssueItem[]) => void;
  /** 取消时丢弃本次临时选择。 */
  onClose: () => void;
}

export function TaskIssuePicker({ group, selected, onConfirm, onClose }: TaskIssuePickerProps) {
  const { t } = useTranslation();
  const items = useIssueStore((state) => state.items).filter((item) => item.group === group);
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set(selected.filter((item) => item.group === group).map((item) => item.id)));
  const [preview, setPreview] = useState<IssueItem | null>(null);
  const visible = items.filter((item) => (item.title + " " + item.projectName).toLowerCase().includes(keyword.trim().toLowerCase()));
  function toggle(id: string) {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-[920px]">
      <DialogHeader><DialogTitle>{t(group === "PR" ? "关联 PR" : "关联 Issue")}</DialogTitle><DialogDescription>{t("勾选条目进行关联，点击标题可预览。")}</DialogDescription></DialogHeader>
      <Input autoFocus value={keyword} onChange={(event) => setKeyword(event.target.value)} aria-label={t("搜索条目")} placeholder={t("搜索标题或项目…")} />
      <div className="grid max-h-[55vh] min-h-64 gap-2 overflow-auto sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
        <div className="overflow-auto rounded-xl bg-muted/30 p-2">
          {visible.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-3" data-selected={selectedIds.has(item.id)}>
            <Checkbox aria-label={t("选择：{{title}}", { title: item.title })} checked={selectedIds.has(item.id)} onCheckedChange={() => toggle(item.id)} />
            <button type="button" className="min-w-0 flex-1 cursor-default text-left" onClick={() => setPreview(item)}>
              <p className="truncate text-xs">{item.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.projectName}</p>
            </button>
            <IconTooltip label={t("预览：{{title}}", { title: item.title })} variant="ghost" size="icon-sm" onClick={() => setPreview(item)}><Eye className="size-3.5" /></IconTooltip>
          </div>)}
          {visible.length === 0 && <p className="p-4 text-xs text-muted-foreground">{t("暂无匹配条目")}</p>}
        </div>
        <aside className="overflow-auto rounded-xl bg-muted/30 p-4">
          {preview ? <><h3 className="text-sm font-medium">{preview.title}</h3><dl className="mt-4 space-y-3 text-xs">
            <div><dt className="text-muted-foreground">{t("项目")}</dt><dd className="mt-1">{preview.projectName}</dd></div>
            <div><dt className="text-muted-foreground">{t("状态")}</dt><dd className="mt-1">{t(issueStatuses[preview.status])}</dd></div>
            <div><dt className="text-muted-foreground">{t("时间")}</dt><dd className="mt-1">{formatDate(preview.date)}</dd></div>
          </dl></> : <p className="text-xs text-muted-foreground">{t("选择条目查看预览")}</p>}
        </aside>
      </div>
      <DialogFooter><span className="mr-auto self-center text-xs text-muted-foreground">{t("已选择 {{count}} 项", { count: selectedIds.size })}</span>
        <Button variant="ghost" onClick={onClose}>{t("取消")}</Button>
        <Button onClick={() => onConfirm(items.filter((item) => selectedIds.has(item.id)))}>{t("确认")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
