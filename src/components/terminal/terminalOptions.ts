import type { ITerminalOptions } from "ghostty-web";

/** 沿用 Navo 的终端配色；尺寸由真实字体度量决定，不再固定字符宽高。 */
export const terminalOptions: ITerminalOptions = {
  fontFamily: 'Menlo, Monaco, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 5000,
  smoothScrollDuration: 0,
  theme: {
    foreground: "#f4f4f5", background: "#111318", cursor: "#f4f4f5", cursorAccent: "#111318",
    selectionBackground: "#3b4261", selectionForeground: "#ffffff",
    black: "#000000", red: "#cd0000", green: "#00cd00", yellow: "#cdcd00",
    blue: "#0000ee", magenta: "#cd00cd", cyan: "#00cdcd", white: "#e5e5e5",
    brightBlack: "#7f7f7f", brightRed: "#ff0000", brightGreen: "#00ff00", brightYellow: "#ffff00",
    brightBlue: "#5c5cff", brightMagenta: "#ff00ff", brightCyan: "#00ffff", brightWhite: "#ffffff",
  },
};
