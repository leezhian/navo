import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ClipboardEvent } from "react";
import { ghosttyVtClient } from "./ghostty-vt/ghosttyVtClient";
import { createTerminalPaletteStyle } from "./terminalPalette";
import { encodeTerminalKey } from "./terminalInput";
import {
  ensureManagedTerminalSession,
  getManagedTerminalStatus,
  subscribeManagedTerminalStatus,
  writeManagedTerminalSession,
} from "./terminalSessionManager";

const CELL_WIDTH_PX = 8;
const CELL_HEIGHT_PX = 16;
const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const MIN_COLUMNS = 2;
const MIN_ROWS = 1;

interface UseTerminalSessionParams {
  /** 终端 Tab 的稳定 id，同时作为主进程 PTY 和 Ghostty 状态的关联键。 */
  sessionId: string;
  /** 新建 PTY 的工作目录，通常是当前审查项目根目录。 */
  cwd?: string;
}

export function useTerminalSession({ sessionId, cwd }: UseTerminalSessionParams) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState(() => getManagedTerminalStatus(sessionId));
  const paletteStyle = useMemo(() => createTerminalPaletteStyle(), []);

  useEffect(() => {
    const unsubscribeFrame = ghosttyVtClient.subscribe(sessionId, setHtml);
    const unsubscribeStatus = subscribeManagedTerminalStatus(sessionId, setStatus);

    return () => {
      unsubscribeFrame();
      unsubscribeStatus();
    };
  }, [sessionId]);

  useEffect(() => {
    const element = terminalRef.current;
    if (!element) {
      return undefined;
    }

    let lastSize: { cols: number; rows: number } | null = null;
    let resizeTimer: number | null = null;
    const resize = () => {
      // display:none 或切换工作区期间尺寸为 0，此时保留 PTY 原尺寸。
      if (element.clientWidth <= 0 || element.clientHeight <= 0) {
        return;
      }

      const cols = getTerminalDimension(element.clientWidth, CELL_WIDTH_PX, MIN_COLUMNS, DEFAULT_COLUMNS);
      const rows = getTerminalDimension(element.clientHeight, CELL_HEIGHT_PX, MIN_ROWS, DEFAULT_ROWS);
      if (lastSize?.cols === cols && lastSize.rows === rows) {
        return;
      }

      lastSize = { cols, rows };
      ensureManagedTerminalSession(sessionId, cwd, cols, rows);
    };

    const observer = new ResizeObserver(() => {
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(resize, 50);
    });
    observer.observe(element);
    resize();

    return () => {
      observer.disconnect();
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
    };
  }, [cwd, sessionId]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const data = encodeTerminalKey(event);
    if (!data) {
      return;
    }

    event.preventDefault();
    void writeManagedTerminalSession(sessionId, data).catch(() => undefined);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const data = event.clipboardData.getData("text");
    if (!data) {
      return;
    }

    event.preventDefault();
    void writeManagedTerminalSession(sessionId, data).catch(() => undefined);
  }

  return {
    html,
    paletteStyle,
    status,
    terminalRef,
    handleKeyDown,
    handlePaste,
  };
}

function getTerminalDimension(
  availablePixels: number,
  cellPixels: number,
  minimum: number,
  fallback: number,
): number {
  const measured = Math.floor(availablePixels / cellPixels);
  return Number.isFinite(measured) && measured > 0 ? Math.max(minimum, measured) : fallback;
}
