import type { ResourceCommand } from "./settingsTypes";

export type CommandDetectionWarningCode = "unreadable" | "invalidManifest" | "ambiguousManager" | "unsupportedWorkspace" | "limitReached";
export interface CommandDetectionWarning {
  /** 相对于所选目录的配置文件，不传递文件内容或原始系统异常。 */
  source: string;
  code: CommandDetectionWarningCode;
}
export interface ResourceCommandDetection {
  /** 配置中明确声明的命令；合并时保留已有 ID、名称及脚本。 */
  commands: ResourceCommand[];
  warnings: CommandDetectionWarning[];
}
