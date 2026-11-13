import { useEffect, useRef, useState } from "react";
import type { TaskNoteInput } from "@/shared/taskResourceTypes";

const COPY_FEEDBACK_DURATION = 2000;
type CopyFeedback = { id: string; text: string; status: "copied" | "failed" };

/** 与 Markdown 文件内容一致，只复制正文；编辑时由调用方传入当前草稿。 */
export function useTaskNoteCopy(note: TaskNoteInput | undefined) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null);
  const request = useRef(0);
  const id = note?.id;
  const text = note?.content ?? "";
  const status = feedback?.id === id && feedback?.text === text ? feedback.status : null;

  // 切换笔记、修改内容或卸载后，不让旧剪贴板请求显示为当前内容的成功反馈。
  useEffect(() => () => { request.current += 1; }, [id, text]);
  useEffect(() => {
    if (feedback?.status !== "copied") return;
    const timer = setTimeout(() => setFeedback(null), COPY_FEEDBACK_DURATION);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function copy() {
    if (!id) return;
    const currentRequest = ++request.current;
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(text);
      if (currentRequest === request.current) setFeedback({ id, text, status: "copied" });
    } catch {
      if (currentRequest === request.current) setFeedback({ id, text, status: "failed" });
    }
  }

  return { copy, copied: status === "copied", copyFailed: status === "failed" };
}
