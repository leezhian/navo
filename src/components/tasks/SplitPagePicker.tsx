import { useTranslation } from "react-i18next";
import { ListTodo, X } from "lucide-react";
import type { Task } from "@/domain/tasks";
import { Button } from "@/components/ui/button";

interface SplitPagePickerProps {
  /** 已打开且尚未参与任何拆分的其他任务。 */
  tasks: Task[];
  /** 合并已有页面，不创建任务或复制页面。 */
  onSelect: (taskId: string) => void;
  /** 取消选页并恢复原独立标签。 */
  onCancel: () => void;
}

export function SplitPagePicker({ tasks, onSelect, onCancel }: SplitPagePickerProps) {
  const { t } = useTranslation();
  return <section className="flex h-full flex-col rounded-[14px] bg-background p-4" aria-label={t("选择标签页")}>
    <header className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{t("选择标签页")}</h2>
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t("取消拆分视图")} onClick={onCancel}><X aria-hidden="true" className="size-4" /></Button>
    </header>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
      {tasks.map((task) => <Button key={task.id} variant="ghost" className="h-9 w-full justify-start text-xs" onClick={() => onSelect(task.id)}>
        <ListTodo aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{task.title}</span>
      </Button>)}
      {!tasks.length && <p className="text-xs leading-6 text-muted-foreground">{t("没有可用于拆分的标签页")}</p>}
    </div>
  </section>;
}
