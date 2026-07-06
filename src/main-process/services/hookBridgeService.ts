import { app } from "electron";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReviewProvider } from "@/domain/types";

export const VIBE_REVIEWER_HOOK_MARKER = "--vibe-reviewer-hook";

const HOOK_BRIDGE_PATH = path.join(os.homedir(), ".vibe-reviewer", "bin", "vibe-reviewer-hook");
const HOOK_COLLECTOR_BUILD_PATH = path.join(".vite", "build", "hookCollector.js");

interface HookBridgeInstallOptions {
  bridgePath?: string;
  collectorScriptPath?: string;
  executablePath?: string;
}

interface HookBridgeScriptOptions {
  collectorScriptPath: string;
  executablePath: string;
}

export async function installHookBridge(options: HookBridgeInstallOptions = {}) {
  const bridgePath = options.bridgePath ?? HOOK_BRIDGE_PATH;
  const script = createHookBridgeScript({
    collectorScriptPath: options.collectorScriptPath ?? getHookCollectorScriptPath(),
    executablePath: options.executablePath ?? process.execPath,
  });

  await mkdir(path.dirname(bridgePath), { recursive: true });
  await writeFile(bridgePath, script, "utf8");
  await chmod(bridgePath, 0o755);

  return bridgePath;
}

export async function removeHookBridge(options: Pick<HookBridgeInstallOptions, "bridgePath"> = {}) {
  await rm(options.bridgePath ?? HOOK_BRIDGE_PATH, { force: true });
}

export function createHookBridgeCommand(bridgePath: string, provider: ReviewProvider) {
  return `${quoteShellArg(bridgePath)} --provider ${provider} ${VIBE_REVIEWER_HOOK_MARKER}`;
}

export function createHookBridgeScript({ collectorScriptPath, executablePath }: HookBridgeScriptOptions) {
  return `#!/bin/zsh
# Vibe Reviewer hook launcher (auto-generated, do not edit)
APP_EXE=${quoteShellArg(executablePath)}
COLLECTOR_JS=${quoteShellArg(collectorScriptPath)}

if [ ! -x "$APP_EXE" ]; then
  exit 0
fi

ELECTRON_RUN_AS_NODE=1 exec "$APP_EXE" "$COLLECTOR_JS" "$@"
`;
}

function getHookCollectorScriptPath() {
  return path.join(app.getAppPath(), HOOK_COLLECTOR_BUILD_PATH);
}

function quoteShellArg(value: string) {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}
