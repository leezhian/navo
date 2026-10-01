import type { Task } from "@/domain/tasks";
import type { IssueItem } from "@/domain/issues";

/** 仅在开发模式初始化预览数据，不导入旧会话，也不作为真实 Agent 或托管平台数据。 */
export const developmentTasks: Task[] = [
  { id: "task-01", title: "设计任务与工作区的组织方式", date: "2026-09-30", projectName: "navo", status: "TODO" },
  { id: "task-02", title: "接入 Agent 会话与运行状态", date: "2026-09-30", projectName: "navo", status: "TODO" },
  { id: "task-03", title: "联调直播控制台营销工具", date: "2026-09-29", projectName: "fq-shop-web", status: "TODO" },
  { id: "task-04", title: "整理直播间消息分发逻辑", date: "2026-09-28", projectName: "fq-mall", status: "TODO" },
  { id: "task-05", title: "完善多项目共享上下文", date: "2026-09-28", projectName: "navo", status: "TODO" },
  { id: "task-06", title: "统一产品名称为 Navo", date: "2026-09-30", projectName: "navo", status: "DONE" },
  { id: "task-07", title: "移除外部 Agent hooks 注入", date: "2026-09-30", projectName: "navo", status: "DONE" },
  { id: "task-08", title: "调整桌面窗口导航布局", date: "2026-09-29", projectName: "navo", status: "DONE" },
  { id: "task-09", title: "优化表格加载与分页体验", date: "2026-09-27", projectName: "fq-ecmiddle-sys", status: "DONE" },
  { id: "task-10", title: "探索首版代码审查方案", date: "2026-09-26", projectName: "navo", status: "ARCHIVED" },
  { id: "task-11", title: "验证直播间奖励组件交互", date: "2026-09-25", projectName: "fq-mall", status: "ARCHIVED" },
  { id: "task-12", title: "整理旧版控制台原型", date: "2026-09-24", projectName: "fq-shop-web", status: "ARCHIVED" },
];

export const developmentIssues: IssueItem[] = [
  { id: "pr-01", group: "PR", tag: "feature", title: "接入多项目工作区与任务上下文", projectName: "navo", status: "review", date: "2026-09-30" },
  { id: "pr-02", group: "PR", tag: "fix", title: "修复直播控制台营销工具加载状态", projectName: "fq-shop-web", status: "review", date: "2026-09-30" },
  { id: "pr-03", group: "PR", tag: "refactor", title: "整理直播间消息路由与事件分发", projectName: "fq-mall", status: "draft", date: "2026-09-29" },
  { id: "pr-04", group: "PR", tag: "refactor", title: "移除旧版 Agent hooks 注入", projectName: "navo", status: "merged", date: "2026-09-28" },
  { id: "issue-01", group: "ISSUE", tag: "feature", title: "支持跨项目任务共享上下文", projectName: "navo", status: "progress", date: "2026-09-30" },
  { id: "issue-02", group: "ISSUE", tag: "fix", title: "任务拖拽时保持圆角与排序动画", projectName: "navo", status: "closed", date: "2026-09-30" },
  { id: "issue-03", group: "ISSUE", tag: "feature", title: "增加营销工具列表筛选与分页", projectName: "fq-shop-web", status: "todo", date: "2026-09-29" },
  { id: "issue-04", group: "ISSUE", tag: "discussion", title: "讨论 Agent 运行状态与通知交互", projectName: "navo", status: "todo", date: "2026-09-28" },
  { id: "issue-05", group: "ISSUE", tag: "fix", title: "优化观看奖励组件的重复渲染", projectName: "fq-mall", status: "progress", date: "2026-09-27" },
];
