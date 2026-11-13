import type { Terminal } from "ghostty-web";

/** 输入法候选窗口跟随 textarea 的插入位置，而不会读取 Canvas 绘制的终端光标。 */
export function bindTerminalInputAnchor(terminal: Terminal) {
  const textarea = terminal.textarea;
  function update() {
    const metrics = terminal.renderer?.getMetrics();
    if (!textarea || !metrics) return;
    const buffer = terminal.buffer.active;
    const col = Math.max(0, Math.min(terminal.cols - 1, buffer.cursorX));
    // 阅读历史时，实时光标可能位于可视区域下方；候选窗口仍需留在终端内。
    const row = Math.max(0, Math.min(terminal.rows - 1, buffer.cursorY + terminal.getViewportY()));
    Object.assign(textarea.style, {
      position: "absolute",
      left: `${col * metrics.width}px`,
      top: `${row * metrics.height}px`,
      width: `${metrics.width}px`,
      height: `${metrics.height}px`,
      fontFamily: terminal.options.fontFamily,
      fontSize: `${terminal.options.fontSize}px`,
      lineHeight: `${metrics.height}px`,
      // 保留真实行高和插入位置，不能用裁剪成零面积的输入框承接原生输入法。
      clipPath: "none",
      opacity: "0",
      pointerEvents: "none",
    });
  }

  const subscriptions = [terminal.onResize(update), terminal.onScroll(update), terminal.onCursorMove(update)];
  // 上游右键复制会临时改写 textarea 的位置和尺寸；再次输入时恢复到终端光标。
  textarea?.addEventListener("focus", update);
  textarea?.addEventListener("keydown", update);
  textarea?.addEventListener("compositionstart", update);
  update();
  return {
    update,
    dispose() {
      subscriptions.forEach((subscription) => subscription.dispose());
      textarea?.removeEventListener("focus", update);
      textarea?.removeEventListener("keydown", update);
      textarea?.removeEventListener("compositionstart", update);
    },
  };
}
