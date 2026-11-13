import type { AppLocale } from "../shared/locales";
import enAgents from "./locales/en/agents.json";
import zhAgents from "./locales/zh-CN/agents.json";
import enCommon from "./locales/en/common.json";
import zhCommon from "./locales/zh-CN/common.json";
import enTaskCreate from "./locales/en/taskCreate.json";
import zhTaskCreate from "./locales/zh-CN/taskCreate.json";
import enSettings from "./locales/en/settings.json";
import zhSettings from "./locales/zh-CN/settings.json";
import enTasks from "./locales/en/tasks.json";
import zhTasks from "./locales/zh-CN/tasks.json";
import enWorkspace from "./locales/en/workspace.json";
import zhWorkspace from "./locales/zh-CN/workspace.json";
import enIssues from "./locales/en/issues.json";
import zhIssues from "./locales/zh-CN/issues.json";
import enReview from "./locales/en/review.json";
import zhReview from "./locales/zh-CN/review.json";
import enTerminal from "./locales/en/terminal.json";
import zhTerminal from "./locales/zh-CN/terminal.json";
import enNativeMenu from "./locales/en/nativeMenu.json";
import zhNativeMenu from "./locales/zh-CN/nativeMenu.json";
import enTrace from "./locales/en/trace.json";
import zhTrace from "./locales/zh-CN/trace.json";

export const namespaces = ["common", "taskCreate", "settings", "tasks", "workspace", "issues", "review", "terminal", "nativeMenu", "agents", "trace"] as const;
export const defaultNS = "common";

const english = {
  agents: enAgents,
  common: enCommon,
  taskCreate: enTaskCreate,
  settings: enSettings,
  tasks: enTasks,
  workspace: enWorkspace,
  issues: enIssues,
  review: enReview,
  terminal: enTerminal,
  nativeMenu: enNativeMenu,
  trace: enTrace,
};

export const resources = {
  en: english,
  "zh-CN": {
    agents: zhAgents,
    common: zhCommon,
    taskCreate: zhTaskCreate,
    settings: zhSettings,
    tasks: zhTasks,
    workspace: zhWorkspace,
    issues: zhIssues,
    review: zhReview,
    terminal: zhTerminal,
    nativeMenu: zhNativeMenu,
    trace: zhTrace,
  },
} satisfies Record<AppLocale, Record<(typeof namespaces)[number], object>>;

export type TranslationResources = typeof english;
