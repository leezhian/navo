const ANSI_COLORS = [
  "#000000",
  "#cd0000",
  "#00cd00",
  "#cdcd00",
  "#0000ee",
  "#cd00cd",
  "#00cdcd",
  "#e5e5e5",
  "#7f7f7f",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#5c5cff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
];

/**
 * Ghostty HTML formatter 使用 `--vt-palette-N` 引用颜色。
 * 应用暂时没有 Ghostty 配置导入时，使用 xterm 兼容的 256 色默认调色板。
 */
export function createTerminalPaletteStyle(): Record<string, string> {
  const colors = [...ANSI_COLORS];
  const levels = [0, 95, 135, 175, 215, 255];
  for (const red of levels) {
    for (const green of levels) {
      for (const blue of levels) {
        colors.push(toHex(red, green, blue));
      }
    }
  }

  for (let index = 0; index < 24; index += 1) {
    const value = 8 + index * 10;
    colors.push(toHex(value, value, value));
  }

  return Object.fromEntries(colors.map((color, index) => [`--vt-palette-${index}`, color]));
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
