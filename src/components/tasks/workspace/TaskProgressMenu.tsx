import { useEffect, useState } from "react";
import { Archive, CircleCheck, CircleDashed, CircleDot, GitPullRequest, RefreshCw, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { TASK_PROGRESS_STAGES, taskProgress, taskProgressView, type TaskProgressStage } from "@/shared/taskProgress";
import { useTaskStore } from "@/stores/taskStore";
import { getTaskError } from "@/services/taskErrors";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const stageIcons = { exploration: CircleDashed, development: CircleDot, review: GitPullRequest, done: CircleCheck, archived: Archive };

interface TaskProgressMenuItemsProps {
  /** 所有入口操作同一个持久化任务阶段，归档任务只读。 */
  task: Task;
  /** 将失败交给当前入口展示，保留原阶段供再次重试。 */
  onError: (message: string) => void;
  /** 上层任务或会话操作期间暂停重复提交。 */
  disabled?: boolean;
}

export function TaskProgressMenuItems({ task, onError, disabled = false }: TaskProgressMenuItemsProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const pending = useTaskStore((state) => state.pending);
  const view = taskProgressView(task);
  const progress = taskProgress(task);
  const hasNotice = progress.settled === false || view.stage === "done" && progress.localChanges;
  const blocked = disabled || pending || view.stage === "archived";
  async function change(stage: TaskProgressStage | null | "reopen") {
    if (blocked) return;
    onError("");
    try { await useTaskStore.getState().setProgress(task.id, stage); }
    catch (error) { onError(getTaskError(error)); }
  }
  return <>
    <DropdownMenuLabel className="flex items-center justify-between gap-2">
      {t("tasks:progress.title")}<span className="font-normal">{t(view.automatic ? "tasks:progress.automatic" : "tasks:progress.manual")}</span>
    </DropdownMenuLabel>
    <DropdownMenuRadioGroup value={view.automatic ? "automatic" : view.stage}
      onValueChange={(value) => void change(value === "automatic" ? null : value as TaskProgressStage)}>
      <DropdownMenuRadioItem value="automatic" className="text-xs" disabled={blocked}>
        <RefreshCw className="size-3.5" />{t("tasks:progress.automatic")}
      </DropdownMenuRadioItem>
      <DropdownMenuSeparator />
      {TASK_PROGRESS_STAGES.map((stage) => {
        const Icon = stageIcons[stage];
        return <DropdownMenuRadioItem key={stage} value={stage} className="text-xs" disabled={blocked}>
          <Icon className="size-3.5" />{t(`tasks:progress.${stage}`)}
        </DropdownMenuRadioItem>;
      })}
    </DropdownMenuRadioGroup>
    {view.stage === "done" && <>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-xs" disabled={blocked} onSelect={() => void change("reopen")}>
        <RotateCcw className="size-3.5" />{t("tasks:progress.reopen")}
      </DropdownMenuItem>
    </>}
    {hasNotice && <DropdownMenuSeparator />}
    {progress.settled === false && <p className="max-w-56 px-1.5 py-1 text-xs leading-relaxed text-muted-foreground">{t("tasks:progress.unavailable")}</p>}
    {view.stage === "done" && progress.localChanges && <p className="max-w-56 px-1.5 py-1 text-xs leading-relaxed text-muted-foreground">{t("tasks:progress.localChanges")}</p>}
  </>;
}

interface TaskProgressMenuProps {
  /** 标题旁的阶段入口；任务切换时清除上一个任务的操作错误。 */
  task: Task;
}

export function TaskProgressMenu({ task }: TaskProgressMenuProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const pending = useTaskStore((state) => state.pending);
  const [error, setError] = useState("");
  const view = taskProgressView(task);
  const Icon = stageIcons[view.stage];
  const label = t(`tasks:progress.${view.stage}`);
  const mode = t(view.automatic ? "tasks:progress.automatic" : "tasks:progress.manual");
  useEffect(() => { setError(""); }, [task.id]);
  return <div className="task-workbench-task-status relative shrink-0">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="gap-1 text-xs font-normal text-muted-foreground" disabled={pending || view.stage === "archived"}
          aria-label={t("tasks:progress.change", { stage: label, mode })} title={view.stage === "archived" ? label : `${label} · ${mode}`}>
          <Icon className="size-3.5" /><span>{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56"><TaskProgressMenuItems task={task} onError={setError} /></DropdownMenuContent>
    </DropdownMenu>
    {error && <p role="alert" className="absolute right-0 top-full z-10 w-56 rounded-md bg-popover p-2 text-xs text-destructive shadow-md">{error}</p>}
  </div>;
}
