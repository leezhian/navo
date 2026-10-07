import type { IssueItem } from "../domain/issues";
import type { TaskWebLink } from "./taskTypes";

export type TaskResourceCategory = "repositories" | "issues" | "pullRequests" | "notes" | "links" | "files";
export interface TaskNote {
  id: string;
  /** 空标题使用界面的未命名笔记文案，正文按 Markdown 原文保存。 */
  title: string;
  content: string;
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
  notes: TaskNote[];
  /** 只能提交当前窗口原生文件选择器签发的标识，不接受任意路径。 */
  fileIds: string[];
}
