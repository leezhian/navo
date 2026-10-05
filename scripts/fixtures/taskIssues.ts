import type { IssueItem } from "../../src/domain/issues";

/** 仅由交互回归显式注入，不参与应用启动数据。 */
export const taskIssueFixtures: IssueItem[] = [
  {
    "id": "fixture-pr-01",
    "group": "PR",
    "tag": "feature",
    "title": "接入多项目工作区与任务上下文",
    "projectName": "navo",
    "provider": "GitHub",
    "repository": "demo/navo",
    "status": "review",
    "date": "2026-09-30"
  },
  {
    "id": "fixture-pr-02",
    "group": "PR",
    "tag": "fix",
    "title": "修复直播控制台营销工具加载状态",
    "projectName": "fq-shop-web",
    "provider": "GitLab",
    "repository": "demo/fq-shop-web",
    "status": "review",
    "date": "2026-09-30"
  },
  {
    "id": "fixture-pr-03",
    "group": "PR",
    "tag": "refactor",
    "title": "整理直播间消息路由与事件分发",
    "projectName": "fq-mall",
    "provider": "GitHub",
    "repository": "demo/fq-mall",
    "status": "draft",
    "date": "2026-09-29"
  },
  {
    "id": "fixture-pr-04",
    "group": "PR",
    "tag": "refactor",
    "title": "移除旧版 Agent hooks 注入",
    "projectName": "navo",
    "provider": "GitHub",
    "repository": "demo/navo",
    "status": "merged",
    "date": "2026-09-28"
  },
  {
    "id": "fixture-issue-01",
    "group": "ISSUE",
    "tag": "feature",
    "title": "支持跨项目任务共享上下文",
    "projectName": "navo",
    "provider": "GitHub",
    "repository": "demo/navo",
    "status": "progress",
    "date": "2026-09-30"
  },
  {
    "id": "fixture-issue-02",
    "group": "ISSUE",
    "tag": "fix",
    "title": "任务拖拽时保持圆角与排序动画",
    "projectName": "navo",
    "provider": "GitHub",
    "repository": "demo/navo",
    "status": "closed",
    "date": "2026-09-30"
  },
  {
    "id": "fixture-issue-03",
    "group": "ISSUE",
    "tag": "feature",
    "title": "增加营销工具列表筛选与分页",
    "projectName": "fq-shop-web",
    "provider": "GitLab",
    "repository": "demo/fq-shop-web",
    "status": "todo",
    "date": "2026-09-29"
  },
  {
    "id": "fixture-issue-04",
    "group": "ISSUE",
    "tag": "discussion",
    "title": "讨论 Agent 运行状态与通知交互",
    "projectName": "navo",
    "provider": "GitHub",
    "repository": "demo/navo",
    "status": "todo",
    "date": "2026-09-28"
  },
  {
    "id": "fixture-issue-05",
    "group": "ISSUE",
    "tag": "fix",
    "title": "优化观看奖励组件的重复渲染",
    "projectName": "fq-mall",
    "provider": "GitHub",
    "repository": "demo/fq-mall",
    "status": "progress",
    "date": "2026-09-27"
  }
];
