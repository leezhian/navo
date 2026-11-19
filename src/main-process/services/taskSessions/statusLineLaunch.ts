import { app } from "electron";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findAgentBinary } from "../agents/agentEnvironment";
import type { StatusLineAgent } from "./statusLinePayload";
import type { StatusLineConnection } from "./sessionStatusLineServer";

interface StatusLineLaunchInput {
  agent: StatusLineAgent;
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** 用户配置的额外 CLI 参数；显式 --settings 合并到同一个会话设置，其他参数原样保留。 */
  args: string[];
  help: string;
  nativeHistoryRoot?: string;
  connect: () => Promise<StatusLineConnection>;
}
export interface StatusLineLaunch {
  /** 已合并本次 statusLine 的额外 CLI 参数，保留原有非状态栏设置。 */
  args: string[];
  /** 回传地址、运行凭证和原始状态栏命令只传给本次 CLI。 */
  env: NodeJS.ProcessEnv;
}
interface StatusLineSettings { [key: string]: unknown; command?: string; enabled?: boolean; stack_with_default?: boolean }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

async function settingsFile(filename: string): Promise<Record<string, unknown>> {
  try {
    const info = await stat(filename);
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error("INVALID_STATUSLINE_SETTINGS");
    const parsed: unknown = JSON.parse(await readFile(filename, "utf8"));
    if (!record(parsed)) throw new Error("INVALID_STATUSLINE_SETTINGS");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function explicitSettings(args: string[], cwd: string) {
  const retained: string[] = []; let settings: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg !== "--settings" && !arg.startsWith("--settings=")) { retained.push(arg); continue; }
    const value = arg === "--settings" ? args[++i] : arg.slice("--settings=".length);
    if (!value) throw new Error("INVALID_STATUSLINE_SETTINGS");
    let parsed: unknown;
    if (value.trimStart().startsWith("{")) parsed = JSON.parse(value);
    else {
      const filename = path.resolve(cwd, value);
      // 显式文件缺失时让 CLI 按原有参数报错，不将它替换成空设置掩盖问题。
      await stat(filename);
      parsed = await settingsFile(filename);
    }
    if (!record(parsed)) throw new Error("INVALID_STATUSLINE_SETTINGS");
    settings = { ...settings, ...parsed };
  }
  return { retained, settings };
}

/** 只用本次启动参数配置 statusLine，保留有效用户命令与设置；无法完整读取时沿用原启动。 */
export async function prepareStatusLineLaunch(input: StatusLineLaunchInput): Promise<StatusLineLaunch | undefined> {
  if (!input.help.includes("--settings") || input.args.includes("--")) return undefined;
  try {
    const node = await findAgentBinary("node", input.env);
    const forwarder = app.isPackaged ? path.join(process.resourcesPath, "statusline-forwarder.cjs")
      : path.join(app.getAppPath(), "src/main-process/services/taskSessions/statusline-forwarder.cjs");
    if (!node || !(await stat(forwarder)).isFile()) return undefined;
    const root = input.agent === "claude" ? input.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")
      : input.nativeHistoryRoot || path.join(os.homedir(), ".gemini", "antigravity-cli");
    // Claude 优先级与 CLI 一致：用户、项目、项目本机、显式会话设置。Antigravity 使用其用户设置。
    const files = input.agent === "claude" ? [path.join(root, "settings.json"), path.join(input.cwd, ".claude/settings.json"), path.join(input.cwd, ".claude/settings.local.json")]
      : [path.join(root, "settings.json")];
    let statusLine: StatusLineSettings = {};
    // 用户通过 --setting-sources 限定来源时，不重新启用被排除的状态栏命令。
    const sourceArg = input.args.find((arg) => arg.startsWith("--setting-sources="));
    const sourceIndex = input.args.indexOf("--setting-sources");
    const sources = sourceArg?.slice("--setting-sources=".length) ?? (sourceIndex >= 0 ? input.args[sourceIndex + 1] : undefined);
    const enabledSources = sources === undefined ? null : new Set(sources.split(","));
    for (const [index, file] of files.entries()) {
      if (input.agent === "claude" && enabledSources && !enabledSources.has(["user", "project", "local"][index])) continue;
      const value = (await settingsFile(file)).statusLine;
      if (record(value)) statusLine = { ...value };
    }
    const { retained, settings } = await explicitSettings(input.args, input.cwd);
    if ("statusLine" in settings) {
      if (!record(settings.statusLine)) return undefined;
      statusLine = { ...statusLine, ...settings.statusLine };
    }
    if (statusLine.enabled === false) return undefined;
    const command = typeof statusLine.command === "string" ? statusLine.command : "";
    // 不套接已经由 Navo 生成的命令，避免用户复制会话参数后产生递归。
    if (command.includes("NAVO_STATUSLINE_")) return undefined;
    const connection = await input.connect();
    const forwardCommand = process.platform === "win32" ? '"%NAVO_STATUSLINE_NODE%" "%NAVO_STATUSLINE_FORWARDER%"'
      : '"$NAVO_STATUSLINE_NODE" "$NAVO_STATUSLINE_FORWARDER"';
    const overlay = { ...settings, statusLine: { ...statusLine, type: "command", command: forwardCommand,
      ...(input.agent === "antigravity" ? { stack_with_default: command.trim() ? statusLine.stack_with_default ?? false : true } : {}) } };
    return { args: [...retained, "--settings", JSON.stringify(overlay)], env: {
      NAVO_STATUSLINE_NODE: node.filename, NAVO_STATUSLINE_FORWARDER: forwarder,
      NAVO_STATUSLINE_URL: connection.url, NAVO_STATUSLINE_TOKEN: connection.token,
      NAVO_STATUSLINE_PASSTHROUGH: command,
    } };
  } catch { return undefined; }
}
