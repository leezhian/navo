/**
 * 创建终端会话时的尺寸和工作目录。
 * 尺寸由渲染器根据实际可用区域计算，主进程只负责将其传给 PTY。
 */
export interface CreateTerminalParams {
  sessionId: string;
  /** 设置页签发的 CLI 操作凭据；不接受渲染进程提供任意启动命令。 */
  operationToken?: string;
  /** 只附着任务服务已启动的 PTY，不回退创建普通 Shell。 */
  attachOnly?: boolean;
  cwd?: string;
  cols: number;
  rows: number;
}

/** 标识一个需要操作的终端会话。 */
export interface TerminalSessionParams {
  sessionId: string;
}

/** PTY 尺寸变化参数，Tab 切换或窗口调整时使用。 */
export interface ResizeTerminalParams extends TerminalSessionParams {
  cols: number;
  rows: number;
}

/** 向 PTY 写入的用户输入，保留字符串中的控制字符。 */
export interface WriteTerminalParams extends TerminalSessionParams {
  data: string;
}

/** 主进程批量转发的 PTY 输出。 */
export interface TerminalDataPayload {
  sessionId: string;
  data: string;
  /** 首次附着的完整有界回放，空内容也发送，作为实时输出的交接边界。 */
  replay?: boolean;
}

/** Shell 退出后发送给渲染进程的结果。 */
export interface TerminalExitPayload {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export type TerminalDataListener = (payload: TerminalDataPayload) => void;
export type TerminalExitListener = (payload: TerminalExitPayload) => void;
