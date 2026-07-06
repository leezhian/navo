import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentStatus, AgentType, ReviewProvider } from "@/domain/types";

const VIBE_REVIEWER_HOOK_MARKER = "--vibe-reviewer-hook";
const VIBE_REVIEWER_STATUS_MESSAGE = "记录 Vibe Reviewer 审查基线";
const HOOK_EVENTS_BY_PROVIDER: Record<ReviewProvider, string[]> = {
  codex: ["UserPromptSubmit", "Stop"],
  claude: ["UserPromptSubmit", "Stop", "SessionEnd"],
};

interface HookConfigFile {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

interface HookGroup {
  hooks?: HookHandler[];
  matcher?: string;
  [key: string]: unknown;
}

interface HookHandler {
  command?: string;
  statusMessage?: string;
  timeout?: number;
  type?: string;
  [key: string]: unknown;
}

export interface AgentHookConfigOptions {
  claudeSettingsPath?: string;
  codexHooksPath?: string;
  executablePath?: string;
}

export type AgentIntegrationStatuses = Partial<Record<AgentType, AgentStatus>>;

export async function setAgentIntegrationEnabled(
  agent: AgentType,
  enabled: boolean,
  options: AgentHookConfigOptions = {},
) {
  const provider = getProviderByAgent(agent);
  if (!provider) {
    return;
  }

  const configPath = getConfigPath(provider, options);
  const config = await readHookConfig(configPath);
  const nextConfig = enabled
    ? addVibeReviewerHooks(config, provider, options.executablePath ?? process.execPath)
    : removeVibeReviewerHooks(config);

  await writeHookConfig(configPath, nextConfig);
}

export async function loadAgentIntegrationStatuses(
  options: AgentHookConfigOptions = {},
): Promise<AgentIntegrationStatuses> {
  const entries = await Promise.all(
    (["Codex", "Claude Code"] as AgentType[]).map(async (agent) => {
      const provider = getProviderByAgent(agent);
      if (!provider) {
        return [agent, "disabled"] as const;
      }

      const config = await readHookConfig(getConfigPath(provider, options));
      return [agent, hasVibeReviewerHooks(config, provider) ? "listening" : "disabled"] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export function addVibeReviewerHooks(
  config: HookConfigFile,
  provider: ReviewProvider,
  executablePath: string,
): HookConfigFile {
  const command = createHookCommand(executablePath, provider);
  const nextConfig: HookConfigFile = {
    ...config,
    hooks: { ...(config.hooks ?? {}) },
  };
  const hooks = nextConfig.hooks ?? {};

  for (const eventName of HOOK_EVENTS_BY_PROVIDER[provider]) {
    const groups = removeMarkerHandlers(hooks[eventName] ?? []);
    groups.push({
      hooks: [
        {
          type: "command",
          command,
          timeout: 30,
          statusMessage: VIBE_REVIEWER_STATUS_MESSAGE,
        },
      ],
    });
    hooks[eventName] = groups;
  }

  return nextConfig;
}

export function removeVibeReviewerHooks(config: HookConfigFile): HookConfigFile {
  if (!config.hooks) {
    return config;
  }

  const hooks = Object.fromEntries(
    Object.entries(config.hooks).flatMap(([eventName, groups]) => {
      const nextGroups = removeMarkerHandlers(groups);
      return nextGroups.length > 0 ? [[eventName, nextGroups]] : [];
    }),
  );

  return {
    ...config,
    hooks,
  };
}

export function hasVibeReviewerHooks(config: HookConfigFile, provider?: ReviewProvider) {
  const eventNames = provider ? HOOK_EVENTS_BY_PROVIDER[provider] : Object.keys(config.hooks ?? {});

  return eventNames.some((eventName) =>
    (config.hooks?.[eventName] ?? []).some((group) =>
      (group.hooks ?? []).some((handler) => isVibeReviewerHookHandler(handler)),
    ),
  );
}

function removeMarkerHandlers(groups: HookGroup[]) {
  return groups.flatMap((group) => {
    const nextHandlers = (group.hooks ?? []).filter((handler) => !isVibeReviewerHookHandler(handler));

    if (nextHandlers.length === 0) {
      return [];
    }

    return [
      {
        ...group,
        hooks: nextHandlers,
      },
    ];
  });
}

async function readHookConfig(configPath: string): Promise<HookConfigFile> {
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as HookConfigFile;
  } catch (error) {
    if (isFileMissingError(error)) {
      return {};
    }

    throw error;
  }
}

async function writeHookConfig(configPath: string, config: HookConfigFile) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await backupConfigFileOnce(configPath);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function backupConfigFileOnce(configPath: string) {
  try {
    const dir = path.dirname(configPath);
    const basename = path.basename(configPath);
    const backupPrefix = `${basename}.vibe-reviewer-backup-`;
    const existingBackups = await readdir(dir).catch(() => []);

    if (existingBackups.some((fileName) => fileName.startsWith(backupPrefix))) {
      return;
    }

    const content = await readFile(configPath, "utf8");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(path.join(dir, `${backupPrefix}${timestamp}`), content, "utf8");
  } catch (error) {
    if (!isFileMissingError(error)) {
      throw error;
    }
  }
}

function getConfigPath(provider: ReviewProvider, options: AgentHookConfigOptions) {
  if (provider === "codex") {
    return options.codexHooksPath ?? path.join(os.homedir(), ".codex", "hooks.json");
  }

  return options.claudeSettingsPath ?? path.join(os.homedir(), ".claude", "settings.json");
}

function createHookCommand(executablePath: string, provider: ReviewProvider) {
  return `${quoteShellArg(executablePath)} --hook collect --provider ${provider} ${VIBE_REVIEWER_HOOK_MARKER}`;
}

function quoteShellArg(value: string) {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

function isVibeReviewerHookHandler(handler: HookHandler) {
  return typeof handler.command === "string" && handler.command.includes(VIBE_REVIEWER_HOOK_MARKER);
}

function getProviderByAgent(agent: AgentType): ReviewProvider | null {
  if (agent === "Codex") {
    return "codex";
  }

  if (agent === "Claude Code") {
    return "claude";
  }

  return null;
}

function isFileMissingError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
