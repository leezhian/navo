import type { AppSettings } from "../domain/types";
import type { ResourceCommandDetection } from "./resourceCommandDetection";

export interface SettingsBootstrap {
  /** null 表示尚未保存配置，渲染进程可迁移旧偏好。 */
  settings: AppSettings | null;
  /** 主进程提供的当前诊断日志文件路径，未配置时为默认路径。 */
  logFilePath: string;
}

export interface ResourceRecord {
  /** 稳定标识，未来任务可引用；移除记录不删除磁盘文件。 */
  id: string;
  kind: "repo" | "folder";
  name: string;
  localPath: string;
  remoteUrl?: string;
  /** 资源用途说明；旧记录缺省为空。 */
  description?: string;
  /** 命令按数组顺序保存，可在任务工作区手动执行。 */
  commands?: ResourceCommand[];
  /** 最近一次静态检测的声明命令与警告，编辑页可手动重新检测。 */
  commandDetection?: ResourceCommandDetection;
  /** 重新加载时检查路径是否仍可访问。 */
  available: boolean;
}

export interface SaveResourceParams {
  /** 编辑已有记录时传入 id；新增时由主进程分配。 */
  id?: string;
  name: string;
  localPath: string;
  kind: "repo" | "folder";
  /** 未传入时保留已有描述；空字符串用于清空。 */
  description?: string;
  /** 未传入时保留已有命令；空数组用于清空。 */
  commands?: ResourceCommand[];
  /** 编辑页重新检测的草稿结果，随保存一起写入，取消不落库。 */
  commandDetection?: ResourceCommandDetection;
}

export const RESOURCE_DESCRIPTION_MAX_LENGTH = 4000;
export const RESOURCE_COMMAND_NAME_MAX_LENGTH = 100;
export const RESOURCE_COMMAND_SCRIPT_MAX_LENGTH = 20000;
export const RESOURCE_COMMAND_LIMIT = 50;

export interface ResourceCommand {
  /** 稳定标识；编辑已有命令时不更换。 */
  id: string;
  name: string;
  /** 原样保存多行脚本，不在编辑或保存时执行。 */
  script: string;
  /** 只在新建 Worktree 后自动执行；已有目录不会触发。 */
  runOnWorktreeCreation: boolean;
}

export interface ResourceGitInfo {
  /** 检查真实 Git 工作区，不依赖资源登记时的 kind。 */
  isRepository: boolean;
  /** 优先 origin，否则使用第一个 remote；无远端时为 null，认证信息已移除。 */
  remoteUrl: string | null;
}

export interface CloneResourceParams {
  /** 调用方生成操作 id，用于取消、进度通知和窗口所有权检查。 */
  operationId: string;
  url: string;
  name: string;
  directory: string;
}

export interface CloneProgress {
  operationId: string;
  /** 经脱敏的 Git 输出，不保存到诊断日志。 */
  message: string;
}

export interface IntegrationStatus {
  id: "gitlab" | "gitlab-self-hosted" | "github" | "github-enterprise" | "linear";
  name: string;
  /** 本阶段只提供占位数据，不代表远端状态。 */
  connected: false;
  placeholder: true;
}
