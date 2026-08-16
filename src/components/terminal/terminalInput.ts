import type { KeyboardEvent } from "react";

const SPECIAL_KEYS: Record<string, string> = {
  ArrowDown: "\u001b[B",
  ArrowLeft: "\u001b[D",
  ArrowRight: "\u001b[C",
  ArrowUp: "\u001b[A",
  Delete: "\u001b[3~",
  End: "\u001b[F",
  Escape: "\u001b",
  Home: "\u001b[H",
  PageDown: "\u001b[6~",
  PageUp: "\u001b[5~",
};

/** 将浏览器键盘事件转换为常见 Shell 可识别的输入序列。 */
export function encodeTerminalKey(event: KeyboardEvent): string | null {
  if (event.nativeEvent.isComposing || event.key === "Dead") {
    return null;
  }

  if (event.key === "Enter") {
    return "\r";
  }
  if (event.key === "Backspace") {
    return "\u007f";
  }
  if (event.key === "Tab") {
    return "\t";
  }

  const specialKey = SPECIAL_KEYS[event.key];
  if (specialKey && !event.ctrlKey && !event.metaKey) {
    return specialKey;
  }

  if (event.ctrlKey && !event.metaKey && event.key.length === 1) {
    return encodeControlCharacter(event.key);
  }

  if (event.altKey && !event.metaKey && event.key.length === 1) {
    return `\u001b${event.key}`;
  }

  if (!event.ctrlKey && !event.metaKey && event.key.length === 1) {
    return event.key;
  }

  return null;
}

function encodeControlCharacter(key: string): string | null {
  const normalizedKey = key.toLowerCase();
  if (normalizedKey >= "a" && normalizedKey <= "z") {
    return String.fromCharCode(normalizedKey.charCodeAt(0) - 96);
  }

  const controlKeys: Record<string, string> = {
    " ": "\u0000",
    "[": "\u001b",
    "\\": "\u001c",
    "]": "\u001d",
    "_": "\u001f",
  };
  return controlKeys[key] ?? null;
}
