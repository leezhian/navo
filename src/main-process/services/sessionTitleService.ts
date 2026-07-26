import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { ReviewProvider } from "@/domain/types";

/** 标题最大长度，超出截断，避免事件日志被超长 prompt 撑大。 */
const MAX_TITLE_LENGTH = 80;

/** transcript 扫描行数上限：首条用户消息通常在文件头部，限量读避免大文件拖慢 hook。 */
const MAX_SCAN_LINES = 500;

/**
 * 非用户输入的注入内容前缀。Agent 会以用户消息身份注入指令与环境信息，不能当作标题：
 * `<` 覆盖 XML 包裹类（command-name、user_instructions、system-reminder 等），
 * 其余为 Codex 的 AGENTS.md 注入头和 Claude 的本地命令提示语。
 */
const INJECTED_CONTENT_PREFIXES = ["<", "# AGENTS.md instructions", "Caveat:"];

/** 把用户 prompt 归一成单行标题：取首个非空行并截断；注入类内容视为无效。 */
export function normalizePromptTitle(prompt: string | undefined): string | undefined {
  if (!prompt) {
    return undefined;
  }

  const firstLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine || INJECTED_CONTENT_PREFIXES.some((prefix) => firstLine.startsWith(prefix))) {
    return undefined;
  }

  return firstLine.length > MAX_TITLE_LENGTH ? `${firstLine.slice(0, MAX_TITLE_LENGTH)}…` : firstLine;
}

/**
 * 从 transcript 提取会话首条用户消息作为标题，用于「标题 = 首轮 prompt」语义：
 * 存量会话没有标题时，从 transcript 找回真实首轮，而不是用当前轮的 prompt 顶替。
 * 文件缺失、格式不符或未找到时返回 undefined，由调用方走回退链。
 */
export async function extractFirstUserPromptFromTranscript(
  provider: ReviewProvider,
  transcriptPath: string | undefined,
): Promise<string | undefined> {
  if (!transcriptPath) {
    return undefined;
  }

  try {
    const lines = createInterface({
      input: createReadStream(transcriptPath, "utf8"),
      crlfDelay: Infinity,
    });
    let scannedLines = 0;

    for await (const line of lines) {
      if (scannedLines >= MAX_SCAN_LINES) {
        break;
      }
      scannedLines += 1;

      const title = normalizePromptTitle(extractUserText(provider, line));
      if (title) {
        return title;
      }
    }
  } catch {
    // transcript 不可读时静默放弃，标题回退到 hook 载荷的 prompt 或分支名展示。
  }

  return undefined;
}

function extractUserText(provider: ReviewProvider, line: string): string | undefined {
  const record = parseJsonLine(line);
  if (!record) {
    return undefined;
  }

  return provider === "codex" ? extractCodexUserText(record) : extractClaudeUserText(record);
}

// Claude transcript 的用户消息形如 { type: "user", message: { content: string | [{ type: "text", text }] } }；
// isMeta 标记的是系统注入内容，直接跳过。
function extractClaudeUserText(record: Record<string, unknown>): string | undefined {
  if (record.type !== "user" || record.isMeta === true || !isRecord(record.message)) {
    return undefined;
  }

  const content = record.message.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
        return item.text;
      }
    }
  }

  return undefined;
}

// Codex rollout 的用户输入形如 { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text }] } }。
function extractCodexUserText(record: Record<string, unknown>): string | undefined {
  const payload = record.payload;
  if (record.type !== "response_item" || !isRecord(payload)) {
    return undefined;
  }

  if (payload.type !== "message" || payload.role !== "user" || !Array.isArray(payload.content)) {
    return undefined;
  }

  for (const item of payload.content) {
    if (isRecord(item) && (item.type === "input_text" || item.type === "text") && typeof item.text === "string") {
      return item.text;
    }
  }

  return undefined;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
