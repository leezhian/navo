import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import type { CSSProperties } from "react";
import { useTerminalSession } from "./useTerminalSession";
import type { TerminalSessionStatus } from "./terminalSessionManager";

interface TerminalWorkspaceProps {
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

export function TerminalWorkspace({ title, sessionId, cwd, operationToken, compact, onStatusChange }: TerminalWorkspaceProps) {
  const { t: translate } = useTranslation(["common", "terminal"]);
  const { html, handleKeyDown, handlePaste, paletteStyle, status, terminalRef } = useTerminalSession({
    cwd,
    sessionId,
    operationToken,
  });
  const shouldShowStartingMessage = !html && (status === "starting" || status === "ready");
  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

  useEffect(() => {
    terminalRef.current?.focus();
  }, [sessionId, terminalRef]);

  return (
    <section className={"flex h-full min-h-0 min-w-0 flex-col bg-background " + (compact ? "" : "pt-12")}>
      <div
        ref={terminalRef}
        aria-label={title + " " + translate("terminal:title")}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none bg-[#111318] px-3 py-2 font-mono text-[13px] leading-4 text-[#f4f4f5] outline-none"
        role="textbox"
        style={paletteStyle as CSSProperties}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      >
        {shouldShowStartingMessage && <div>{translate("terminal:starting")}</div>}
        {!html && status === "exited" && <div>{translate("terminal:exited")}</div>}
        {!html && status === "error" && <div className="text-destructive">{translate("terminal:startError")}</div>}
        {html && <div dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </section>
  );
}
