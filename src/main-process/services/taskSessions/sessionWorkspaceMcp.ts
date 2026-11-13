import type { TaskContextConnection } from "./taskContextServer";
import { reapAntigravityPlugins, removeAntigravityPlugin, writeAntigravityPlugin } from "./antigravityWorkspacePlugin";
import { attachGrokWorkspace, detachGrokWorkspace } from "./grokWorkspaceConfig";
import { NAVO_TASK_TOKEN_ENV, assertTaskContextToken, assertTaskContextUrl } from "./taskMcpGuards";

export { helpOffersMcpCommand, assertTaskContextToken, assertTaskContextUrl, NAVO_TASK_SERVER, NAVO_TASK_TOKEN_ENV } from "./taskMcpGuards";
export { mergeGrokTaskBlock, stripGrokTaskBlock } from "./grokWorkspaceConfig";

export interface SessionWorkspaceMcpOptions {
  /** 应用私有目录。每个 Antigravity 会话在其中建 0700 子目录，不写用户 MCP 配置。测试传入临时路径。 */
  pluginRoot?: string;
}

export interface WorkspaceMcpAttachment {
  env: NodeJS.ProcessEnv;
  /** Antigravity 要追加 --add-dir。Grok 没有额外参数。 */
  args?: string[];
}

export interface WorkspaceMcpAttachInput {
  agentId: "grok" | "antigravity";
  sessionId: string;
  cwd: string;
  connection: TaskContextConnection;
}

/**
 * Grok 只把项目 `.grok/config.toml` 的 MCP 段并入会话，不写 ~/.grok。
 * Antigravity 按 Kepler 的做法写应用私有插件目录，并用 --add-dir 交给 CLI；不改用户 MCP 配置。
 */
export class SessionWorkspaceMcp {
  private readonly grokBySession = new Map<string, string>();
  private readonly grokByCwd = new Map<string, Set<string>>();
  private readonly antigravitySessions = new Set<string>();
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: SessionWorkspaceMcpOptions = {}) {}

  attach(input: WorkspaceMcpAttachInput) { return this.exclusive(() => this.attachUnlocked(input)); }
  release(sessionId: string) { return this.exclusive(() => this.releaseUnlocked(sessionId)); }
  /** 启动时清掉崩溃留下的私有插件目录。不碰用户 MCP 配置。 */
  reapAntigravity() { return this.exclusive(() => this.reapUnlocked()); }
  async close() {
    await this.exclusive(async () => {
      for (const sessionId of new Set([...this.grokBySession.keys(), ...this.antigravitySessions])) await this.releaseUnlocked(sessionId);
      await this.reapUnlocked();
    });
  }

  private exclusive<Result>(operation: () => Promise<Result>) {
    const result = this.chain.then(operation, operation);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  private async attachUnlocked(input: WorkspaceMcpAttachInput): Promise<WorkspaceMcpAttachment> {
    const token = assertTaskContextToken(input.connection.token);
    const url = assertTaskContextUrl(input.connection.url);
    if (input.agentId === "grok") {
      const root = await attachGrokWorkspace(input.cwd, url);
      this.rememberGrok(input.sessionId, root);
      return { env: { [NAVO_TASK_TOKEN_ENV]: token } };
    }
    if (!this.options.pluginRoot) throw new Error("SESSION_CONTEXT_UNAVAILABLE");
    const plugin = await writeAntigravityPlugin(this.options.pluginRoot, input.sessionId, url, token);
    this.antigravitySessions.add(input.sessionId);
    return { env: {}, args: plugin.args };
  }

  private async releaseUnlocked(sessionId: string) {
    const root = this.grokBySession.get(sessionId);
    if (root) {
      this.grokBySession.delete(sessionId);
      const sessions = this.grokByCwd.get(root);
      sessions?.delete(sessionId);
      if (sessions && sessions.size === 0) {
        this.grokByCwd.delete(root);
        // 停止会话优先。这段配置没有凭证，下次接入会重写。
        try { await detachGrokWorkspace(root); } catch { /* 留到下次接入或应用退出再清。 */ }
      }
    }
    if (!this.antigravitySessions.delete(sessionId) || !this.options.pluginRoot) return;
    try { await removeAntigravityPlugin(this.options.pluginRoot, sessionId); } catch { /* 停止不因清理失败而失败。 */ }
  }

  private async reapUnlocked() {
    this.antigravitySessions.clear();
    await reapAntigravityPlugins(this.options.pluginRoot);
  }

  private rememberGrok(sessionId: string, root: string) {
    const previous = this.grokBySession.get(sessionId);
    if (previous && previous !== root) this.grokByCwd.get(previous)?.delete(sessionId);
    this.grokBySession.set(sessionId, root);
    const sessions = this.grokByCwd.get(root) ?? new Set<string>();
    sessions.add(sessionId);
    this.grokByCwd.set(root, sessions);
  }
}
