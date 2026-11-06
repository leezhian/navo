import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useTerminalSession } from "./useTerminalSession";
import type { TerminalSessionStatus } from "./terminalSessionManager";
import "./terminal.css";

interface TerminalWorkspaceProps {
  /** 命令快捷运行只展开输出，不抢走当前输入焦点。 */
  autoFocus?: boolean;
  /** 任务服务已启动会话，不因视图挂载重新创建进程。 */
  attachOnly?: boolean;
  /** 主进程签发的设置操作凭据，不传时创建普通 Shell。 */
  operationToken?: string;
  /** CLI 操作面板不预留原审查页面的顶部空间。 */
  compact?: boolean;
  /** 初始化失败等终端状态反馈，退出码仍由终端事件提供。 */
  onStatusChange?: (status: TerminalSessionStatus) => void;
  /** 当前终端 Tab 标题，用作终端区域的无障碍名称。 */
  title: string;
  /** 终端 Tab 的稳定 id，不能在 Tab 生命周期内变化。 */
  sessionId: string;
  /** 新建终端时使用的默认工作目录。 */
  cwd?: string;
}

export function TerminalWorkspace({ title, sessionId, cwd, operationToken, compact, onStatusChange, attachOnly, autoFocus = true }: TerminalWorkspaceProps) {
  const { t: translate } = useTranslation(["common", "terminal"]);
  const { hasOutput, status, terminalRef } = useTerminalSession({
    cwd,
    sessionId,
    operationToken,
    attachOnly,
    autoFocus,
    label: title + " " + translate("terminal:title"),
  });
  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

  return (
    <section className={"flex h-full min-h-0 min-w-0 flex-col bg-background " + (compact ? "" : "pt-12")}>
      <div className="navo-terminal-container" data-terminal-id={sessionId} data-status={status}>
        <div ref={terminalRef} className="navo-terminal-host" />
        {!hasOutput && status === "starting" && <div className="navo-terminal-status" role="status">{translate("terminal:starting")}</div>}
        {!hasOutput && status === "exited" && <div className="navo-terminal-status">{translate("terminal:exited")}</div>}
        {status === "error" && <div className="navo-terminal-status text-destructive" role="alert">{translate("terminal:startError")}</div>}
      </div>
    </section>
  );
}
