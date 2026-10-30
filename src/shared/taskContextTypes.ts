/** 固定正文入口，不作为普通笔记入库。 */
export const TASK_PROMPT_ID = "task-prompt";

export type TaskResourceRemoval = { kind: "workspace" | "issue" | "link" | "file" | "attachment"; id: string };

export interface TaskInitializationStep {
  id: string;
  resourceId: string;
  name: string;
  status: "pending" | "running" | "succeeded" | "failed";
  exitCode?: number;
}
