export type TaskStatus = "TODO" | "DONE" | "ARCHIVED";

export interface Task {
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
}
