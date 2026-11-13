import type { IssueItem } from "../domain/issues";
import type { TaskResourceInput, TaskWebLink } from "./taskTypes";

export type TaskResourceCategory = "repositories" | "issues" | "pullRequests" | "notes" | "links" | "files";
export interface TaskNoteInput {
  id: string;
  /** 空标题使用界面的未命名笔记文案，正文按 Markdown 原文保存。 */
  title: string;
  content: string;
}
export interface TaskNoteUpdate extends TaskNoteInput {
  /** 省略则保留原顺序；相同序号按原插入顺序稳定展示。 */
  sortOrder?: number;
}
export interface TaskNote extends TaskNoteInput {
  /** 最近保存者与原创建者分开记录，历史迁移无法确认时为 unknown。 */
  lastEditor?: import("./taskNoteTypes").TaskNoteActor;
  lastEditorSessionId?: string;
  comments?: import("./taskNoteTypes").TaskNoteComment[];
  /** 笔记独立版本，从 1 开始；修改和删除必须提交读到的版本。 */
  version: number;
  /** 创建来源由主进程记录，后续编辑不改写作者。 */
  origin: "user" | "agent";
  /** Agent 创建时对应的 Navo 会话，不接受调用方指定其他会话。 */
  sessionId?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface TaskFileReference {
  id: string;
  name: string;
  /** 系统选择器确认后的规范路径；绑定不复制、不修改原文件。 */
  path: string;
  size: number;
}
export interface AddTaskResourcesInput {
  /** 同一提交重试沿用，避免响应丢失后重复添加笔记或文件。 */
  requestId: string;
  links: IssueItem[];
  webLinks: TaskWebLink[];
  notes: TaskNoteInput[];
  /** 只能提交当前窗口原生文件选择器签发的标识，不接受任意路径。 */
  fileIds: string[];
  /** 追加工作目录时单独提交；路径由主进程依据全局资源 ID 解析。 */
  resources?: TaskResourceInput[];
}
