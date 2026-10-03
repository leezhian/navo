import { t } from "@/i18n";
import { getSettingsError } from "./settingsErrors";

const messages: Record<string, string> = {
  TASK_INVALID: "任务内容无效，请检查描述和所选资源。",
  TASK_INVALID_TITLE: "请输入不超过 160 字的任务标题。",
  TASK_NOT_FOUND: "任务已被删除，请刷新列表。",
  TASK_INVALID_BRANCH: "分支名无效，请修改名称或设置中的分支前缀。",
  TASK_BRANCH_EXISTS: "目标分支已存在，请更换名称。",
  TASK_INVALID_SOURCE: "源分支已失效，请重新选择。",
  TASK_EMPTY_REPOSITORY: "仓库尚无提交，暂时无法创建任务工作区。",
  TASK_DIRTY_REPOSITORY: "原仓库有未提交改动，请处理后重试，或使用独立 Worktree。",
  TASK_RESOURCE_CHANGED: "工作目录或分支状态已变化，请重新选择资源。",
  TASK_DUPLICATE_RESOURCE: "同一仓库或目录不能重复添加。",
  TASK_FILES_ONLY: "只能添加文件，不能添加目录。",
  TASK_ATTACHMENT_MISSING: "附件已失效，请重新选择文件。",
  TASK_CREATE_RETAINED: "创建未完成，部分分支或工作目录已保留，请检查后重试。",
  TASK_BUSY: "任务操作正在进行，请稍后重试。",
  TASK_LEGACY_INVALID: "旧任务数据损坏，未覆盖原记录，请修复后重试。",
};

export function getTaskError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages).find((key) => message.includes(key));
  return code ? t(messages[code]) : getSettingsError(error);
}
