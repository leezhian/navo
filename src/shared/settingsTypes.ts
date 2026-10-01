import type { AppSettings } from "../domain/types";

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
  /** 重新加载时检查路径是否仍可访问。 */
  available: boolean;
}

export interface SaveResourceParams {
  /** 编辑已有记录时传入 id；新增时由主进程分配。 */
  id?: string;
  name: string;
  localPath: string;
  kind: "repo" | "folder";
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
