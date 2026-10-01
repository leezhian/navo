export interface WindowTerminalTab {
  /** 终端页标识，用于激活、关闭及管理 PTY 生命周期。 */
  id: string;
  /** 终端页展示名称。 */
  title: string;
  /** 创建终端时使用的工作目录。 */
  cwd?: string;
}
