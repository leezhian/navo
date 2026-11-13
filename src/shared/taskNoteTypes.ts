export type TaskNoteActor = "user" | "agent" | "unknown";
export interface TaskNoteVersion {
  noteId: string;
  version: number;
  title: string;
  content: string;
  /** 升级时只保留当前快照，不补造旧版本或编辑者。 */
  kind: "create" | "edit" | "restore" | "baseline";
  actor: TaskNoteActor;
  sessionId?: string;
  createdAt: string;
  restoredFrom?: number;
}

export interface TaskNoteComment {
  id: string;
  noteId: string;
  /** 评论以保存时的版本和 Markdown 行号定位，quote 保存对应原文以检测过期。 */
  noteVersion: number;
  startLine: number;
  endLine: number;
  quote: string;
  body: string;
  /** 回复沿用主评论的锚点。 */
  parentId?: string;
  actor: TaskNoteActor;
  sessionId?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface TaskNoteCommentInput {
  /** 由调用方生成并复用，避免请求重试重复发布评论。 */
  id: string;
  noteId: string;
  noteVersion: number;
  startLine: number;
  endLine: number;
  quote: string;
  body: string;
  parentId?: string;
}
