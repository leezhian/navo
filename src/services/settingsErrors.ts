import { t } from "@/i18n";

const messages: Record<string, string> = {
  INVALID_LOG_FILE: "请选择 .log 文件。",
  LOG_FILE_IN_USE: "已有文件不是 Navo 诊断日志，请选择空文件或新的日志文件，避免覆盖其他内容。",
  DESKTOP_REQUIRED: "浏览器预览不支持本地设置和仓库管理。",
  INVALID_DIRECTORY: "请选择有效的绝对目录路径。",
  DUPLICATE_RESOURCE: "该本地路径已经添加。",
  DIRECTORY_EXISTS: "目标目录已存在，不会覆盖。",
  INVALID_REPOSITORY_URL: "请输入有效的 HTTPS 或 SSH 仓库地址，不要包含密码或 token。",
  INVALID_REPOSITORY_NAME: "仓库名称只能包含字母、数字、点、下划线或横线。",
  INVALID_RESOURCE: "资源记录无效或已移除。",
  RESOURCE_NOT_FOUND: "资源记录无效或已移除。",
  CLONE_FAILED: "克隆失败，请检查仓库地址、网络和系统 Git 认证。",
  GIT_UNAVAILABLE: "未找到可用的 Git。",
  CLONE_CANCELLED: "克隆已取消。",
  CLONE_RECORD_FAILED: "仓库已克隆，但记录保存失败。请通过本地文件夹入口添加，磁盘文件已保留。",
  INVALID_RESOURCE_STORAGE: "本地配置文件损坏，请修复文件后重试。",
  INVALID_SETTINGS: "本地配置文件损坏，请修复文件后重试。",
  EACCES: "目录不可访问或没有写入权限。",
  EPERM: "目录不可访问或没有写入权限。",
  ENOENT: "请选择有效的绝对目录路径。",
};

export function getSettingsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages).find((key) => message.includes(key));
  return t(code ? messages[code] : "操作失败，请重试。");
}
