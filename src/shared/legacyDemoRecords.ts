/** 仅用于识别并清理历史演示记录，不用于初始化或渲染页面。 */
const taskSignatures = new Set([
  "[\"task-01\",\"设计任务与工作区的组织方式\",\"2026-09-30\",\"navo\"]",
  "[\"task-02\",\"接入 Agent 会话与运行状态\",\"2026-09-30\",\"navo\"]",
  "[\"task-03\",\"联调直播控制台营销工具\",\"2026-09-29\",\"fq-shop-web\"]",
  "[\"task-04\",\"整理直播间消息分发逻辑\",\"2026-09-28\",\"fq-mall\"]",
  "[\"task-05\",\"完善多项目共享上下文\",\"2026-09-28\",\"navo\"]",
  "[\"task-06\",\"统一产品名称为 Navo\",\"2026-09-30\",\"navo\"]",
  "[\"task-07\",\"移除外部 Agent hooks 注入\",\"2026-09-30\",\"navo\"]",
  "[\"task-08\",\"调整桌面窗口导航布局\",\"2026-09-29\",\"navo\"]",
  "[\"task-09\",\"优化表格加载与分页体验\",\"2026-09-27\",\"fq-ecmiddle-sys\"]",
  "[\"task-10\",\"探索首版代码审查方案\",\"2026-09-26\",\"navo\"]",
  "[\"task-11\",\"验证直播间奖励组件交互\",\"2026-09-25\",\"fq-mall\"]",
  "[\"task-12\",\"整理旧版控制台原型\",\"2026-09-24\",\"fq-shop-web\"]",
]);

const issueSignatures = new Map<string, { provider: string; repository: string }>([
  ["[\"pr-01\",\"接入多项目工作区与任务上下文\",\"2026-09-30\",\"navo\",\"PR\"]", {"provider":"GitHub","repository":"demo/navo"}],
  ["[\"pr-02\",\"修复直播控制台营销工具加载状态\",\"2026-09-30\",\"fq-shop-web\",\"PR\"]", {"provider":"GitLab","repository":"demo/fq-shop-web"}],
  ["[\"pr-03\",\"整理直播间消息路由与事件分发\",\"2026-09-29\",\"fq-mall\",\"PR\"]", {"provider":"GitHub","repository":"demo/fq-mall"}],
  ["[\"pr-04\",\"移除旧版 Agent hooks 注入\",\"2026-09-28\",\"navo\",\"PR\"]", {"provider":"GitHub","repository":"demo/navo"}],
  ["[\"issue-01\",\"支持跨项目任务共享上下文\",\"2026-09-30\",\"navo\",\"ISSUE\"]", {"provider":"GitHub","repository":"demo/navo"}],
  ["[\"issue-02\",\"任务拖拽时保持圆角与排序动画\",\"2026-09-30\",\"navo\",\"ISSUE\"]", {"provider":"GitHub","repository":"demo/navo"}],
  ["[\"issue-03\",\"增加营销工具列表筛选与分页\",\"2026-09-29\",\"fq-shop-web\",\"ISSUE\"]", {"provider":"GitLab","repository":"demo/fq-shop-web"}],
  ["[\"issue-04\",\"讨论 Agent 运行状态与通知交互\",\"2026-09-28\",\"navo\",\"ISSUE\"]", {"provider":"GitHub","repository":"demo/navo"}],
  ["[\"issue-05\",\"优化观看奖励组件的重复渲染\",\"2026-09-27\",\"fq-mall\",\"ISSUE\"]", {"provider":"GitHub","repository":"demo/fq-mall"}],
]);

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isLegacyDemoTask(value: unknown) {
  if (!record(value)) return false;
  if (value.description !== undefined && value.description !== "") return false;
  if (["resources", "links", "webLinks", "attachments"].some((key) => value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length > 0))) return false;
  return taskSignatures.has(JSON.stringify([value.id, value.title, value.date, value.projectName]));
}

export function isLegacyDemoIssue(value: unknown) {
  if (!record(value)) return false;
  const known = issueSignatures.get(JSON.stringify([value.id, value.title, value.date, value.projectName, value.group]));
  return !!known && (value.provider === undefined || value.provider === known.provider)
    && (value.repository === undefined || value.repository === known.repository);
}
