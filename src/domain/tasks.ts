import type { IssueItem } from "./issues";
import type { TaskAgentSelection } from "../shared/agentCapabilities";
import type { TaskAttachment, TaskResource, TaskWebLink } from "../shared/taskTypes";

export type TaskStatus = "TODO" | "DONE" | "ARCHIVED";

export interface Task {
  /** 创建时选择的 Agent、模型、模式和思考等级；旧任务可缺省。 */
  agent?: TaskAgentSelection;
  /** 任务的唯一标识，不在卡片中展示。 */
  id: string;
  /** 卡片标题，最多显示两行。 */
  title: string;
  /** ISO 日期，用于展示与日期排序。 */
  date: string;
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
  /** 归档前的状态，用于恢复；旧记录缺省恢复 TODO。 */
  archivedFrom?: "TODO" | "DONE";
}
