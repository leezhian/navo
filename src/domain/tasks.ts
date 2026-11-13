import type { IssueItem } from "./issues";
import type { TaskAgentSelection } from "../shared/agentCapabilities";
import type { TaskAttachment, TaskResource, TaskWebLink } from "../shared/taskTypes";
import type { TaskFileReference, TaskNote } from "../shared/taskResourceTypes";

export type TaskStatus = "TODO" | "DONE" | "ARCHIVED";

export interface Task {
  /** 正文、笔记、资源每次成功修改后递增，供运行中的 Agent 判断上下文变化。 */
  contextVersion?: number;
  /** 正文独立版本；笔记或其他资源修改不会改变它。 */
  promptVersion?: number;
  promptComments?: import("../shared/taskNoteTypes").TaskNoteComment[];
  /** 正文最近一次保存的信息，不使用其他任务变更时间冒充正文更新时间。 */
  promptMetadata?: Pick<TaskNote, "updatedAt" | "lastEditor" | "lastEditorSessionId">;
  /** 新 Worktree 的初始化检查点；脚本仅保存在主进程数据库。 */
  initialization?: import("../shared/taskContextTypes").TaskInitializationStep[];
  /** 创建时选择的 Agent、模型、模式和思考等级；旧任务可缺省。 */
  agent?: TaskAgentSelection;
  /** 任务的唯一标识，不在卡片中展示。 */
  id: string;
  /** 卡片标题，最多显示两行。 */
  title: string;
  /** ISO 日期，用于展示与日期排序。 */
  date: string;
  /** 任务内容或状态最近一次实际修改时间；会话活动单独记录。 */
  updatedAt: string;
  /** 任务所属项目的名称。 */
  projectName: string;
  /** 任务所属的看板列。 */
  status: TaskStatus;
  /** 老任务没有描述和关联数据，迁移时保留原卡片内容。 */
  description?: string;
  resources?: TaskResource[];
  links?: IssueItem[];
  /** 用户添加的文档、规范等普通网页链接。 */
  webLinks?: TaskWebLink[];
  attachments?: TaskAttachment[];
  /** 直接绑定的原文件路径，与创建任务时复制的附件分开存储。 */
  files?: TaskFileReference[];
  notes?: TaskNote[];
  /** 归档前的状态，用于恢复；旧记录缺省恢复 TODO。 */
  archivedFrom?: "TODO" | "DONE";
}
