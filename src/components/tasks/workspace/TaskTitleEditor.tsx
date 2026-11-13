import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/domain/tasks";
import { useTaskStore } from "@/stores/taskStore";
import { getTaskError } from "@/services/taskErrors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TaskTitleEditorProps {
  /** 当前任务；外部更新标题时同步展示，编辑中不打断输入。 */
  task: Task;
  headingId: string;
  /** 由 F2 / 菜单触发的编辑请求计数，变化时进入编辑。 */
  editRequest?: number;
  /** 标题与状态之间的操作菜单（⋮）。 */
  menu?: ReactNode;
}

/** 详情顶栏就地重命名：双击、F2、菜单进入同一编辑态；列表右键仍用弹窗。 */
export function TaskTitleEditor({ task, headingId, editRequest = 0, menu }: TaskTitleEditorProps) {
  const { t } = useTranslation(["tasks", "common"]);
  const pending = useTaskStore((state) => state.pending);
  const error = useTaskStore((state) => state.error);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastRequest = useRef(editRequest);

  useEffect(() => {
    if (!editing) setTitle(task.title);
  }, [task.title, editing]);

  useEffect(() => {
    if (editRequest > 0 && editRequest !== lastRequest.current) {
      lastRequest.current = editRequest;
      if (!useTaskStore.getState().pending) {
        useTaskStore.setState({ error: null });
        setTitle(task.title);
        setEditing(true);
      }
    }
  }, [editRequest, task.title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function beginEdit() {
    if (pending) return;
    useTaskStore.setState({ error: null });
    setTitle(task.title);
    setEditing(true);
  }

  function cancel() {
    if (pending) return;
    setEditing(false);
    setTitle(task.title);
    useTaskStore.setState({ error: null });
  }

  async function confirm() {
    const next = title.trim();
    if (!next || pending) return;
    if (next === task.title) { setEditing(false); return; }
    const success = await useTaskStore.getState().rename(task.id, next);
    if (success) setEditing(false);
  }

  const status = <span className="task-workbench-task-status">{task.status}</span>;

  if (!editing) {
    return <div className="task-workbench-title">
      <h2 id={headingId} title={task.title} onDoubleClick={beginEdit}>{task.title}</h2>
      {menu}
      {status}
    </div>;
  }

  // 编辑态只保留输入框和确认／取消，状态标签先藏掉，避免挤到右侧按钮组。
  return <div className="task-workbench-title task-workbench-title-editing relative">
    <Input ref={inputRef} id={headingId} aria-label={t("tasks:fields.title")} className="task-workbench-title-input"
      maxLength={160} disabled={pending} value={title}
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") { event.preventDefault(); void confirm(); }
        if (event.key === "Escape") { event.preventDefault(); cancel(); }
      }}
      onBlur={(event) => {
        // 点确认／取消按钮时先别取消，避免抢在 click 前关闭。
        const next = event.relatedTarget as HTMLElement | null;
        if (next?.closest("[data-title-edit-action]")) return;
      }}
      aria-invalid={error !== null || !title.trim()}
    />
    <Button data-title-edit-action="" variant="ghost" size="icon-xs" aria-label={t("common:actions.confirm")} disabled={pending || !title.trim()} onClick={() => void confirm()}><Check className="size-3.5" /></Button>
    <Button data-title-edit-action="" variant="ghost" size="icon-xs" aria-label={t("common:actions.cancel")} disabled={pending} onClick={cancel}><X className="size-3.5" /></Button>
    {error !== null && <p role="alert" className="task-workbench-title-error">{getTaskError(error)}</p>}
  </div>;
}
