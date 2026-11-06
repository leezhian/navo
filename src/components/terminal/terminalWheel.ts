import type { Terminal } from "ghostty-web";

const mode = {
  applicationCursor: 1,
  utf8Mouse: 1005,
  sgrMouse: 1006,
  alternateScroll: 1007,
  urxvtMouse: 1015,
  sgrPixelMouse: 1016,
} as const;
const wheelButton = { up: 64, down: 65 } as const;
const gestureIdleMs = 200;

/**
 * ghostty-web 0.4.0 在备用屏幕无条件发送方向键，尚未实现滚轮鼠标上报。
 * 使用 WASM 解析后的模式及公开事件接口补齐，不能按 CLI 名称猜测协议。
 */
export function createTerminalWheelHandler(terminal: Terminal) {
  let remainder = 0;
  let previousRoute = "";
  let previousTime = 0;

  return (event: WheelEvent): boolean => {
    const alternate = terminal.buffer.active.type === "alternate";
    const mouse = terminal.hasMouseTracking();
    const local = event.shiftKey || terminal.options.disableStdin;
    const route = `${alternate}:${mouse}:${local}`;
    const metrics = terminal.renderer?.getMetrics();
    if (!metrics) return true;

    // 普通 Shell 沿用库的连续历史滚动；Shift 可绕过 CLI 鼠标上报。
    if (local || (!mouse && !alternate)) {
      remainder = 0;
      previousRoute = route;
      if (!local) return false;
      terminal.scrollLines(wheelLines(event, metrics.height, terminal.rows));
      return true;
    }

    // 横向滚动不能变成向上键；未请求备用屏幕滚动的 CLI 也不接收模拟按键。
    if (!event.deltaY || (!mouse && !terminal.getMode(mode.alternateScroll))) {
      remainder = 0;
      return true;
    }
    const delta = wheelLines(event, metrics.height, terminal.rows);
    if (route !== previousRoute || event.timeStamp - previousTime > gestureIdleMs || Math.sign(delta) !== Math.sign(remainder)) remainder = 0;
    previousRoute = route;
    previousTime = event.timeStamp;
    // 累积触控板的细小像素位移，不让每个小事件丢失或都变成一次整行滚动。
    remainder += delta;
    const lines = Math.trunc(remainder);
    remainder -= lines;
    if (!lines) return true;

    const input = mouse
      ? mouseWheelInput(terminal, event, lines < 0 ? wheelButton.up : wheelButton.down)
      : `\x1b${terminal.getMode(mode.applicationCursor) ? "O" : "["}${lines < 0 ? "A" : "B"}`;
    // 单个事件最多移动一屏，并合并为一次 PTY 写入，避免大幅滚动产生 IPC 洪泛。
    if (input) terminal.input(input.repeat(Math.min(Math.abs(lines), terminal.rows)), true);
    return true;
  };
}

function wheelLines(event: WheelEvent, height: number, rows: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * rows;
  return event.deltaY / height;
}

function mouseWheelInput(terminal: Terminal, event: WheelEvent, button: number) {
  const renderer = terminal.renderer;
  if (!renderer) return "";
  const rect = renderer.getCanvas().getBoundingClientRect();
  if (!rect.width || !rect.height) return "";
  const metrics = renderer.getMetrics();
  // DOM 坐标是 CSS 像素，与 Canvas 的 DPR 无关；分栏缩放时按实际显示尺寸映射。
  const x = Math.max(0, (event.clientX - rect.left) * terminal.cols * metrics.width / rect.width);
  const y = Math.max(0, (event.clientY - rect.top) * terminal.rows * metrics.height / rect.height);
  const col = Math.min(terminal.cols, Math.floor(x / metrics.width) + 1);
  const row = Math.min(terminal.rows, Math.floor(y / metrics.height) + 1);
  const code = button + (event.altKey ? 8 : 0) + (event.ctrlKey ? 16 : 0);
  if (terminal.getMode(mode.sgrPixelMouse)) {
    const pixelX = Math.min(Math.ceil(terminal.cols * metrics.width), Math.floor(x) + 1);
    const pixelY = Math.min(Math.ceil(terminal.rows * metrics.height), Math.floor(y) + 1);
    return `\x1b[<${code};${pixelX};${pixelY}M`;
  }
  if (terminal.getMode(mode.sgrMouse)) return `\x1b[<${code};${col};${row}M`;
  if (terminal.getMode(mode.urxvtMouse)) return `\x1b[${code + 32};${col};${row}M`;
  // 当前 PTY 接口写入 UTF-8 字符串；老协议坐标超过 95 会被编码成多字节，需跳过而非发错坐标。
  // CLI 开启 UTF-8 扩展后可传到 2015；SGR 和 URXVT 不受这个单字节限制。
  const maxCoordinate = terminal.getMode(mode.utf8Mouse) ? 2015 : 95;
  if (col > maxCoordinate || row > maxCoordinate) return "";
  return `\x1b[M${String.fromCharCode(code + 32, col + 32, row + 32)}`;
}
