import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, stat } from "node:fs/promises";
import { shell } from "electron";
import type { Task } from "../../domain/tasks";
import { EDITOR_IDS, type WorkspaceOpenOptions, type WorkspaceOpenTarget } from "../../shared/workspaceOpenTypes";
import { repositoryWebLink } from "../../utils/repositoryWebLink";
import { inspectResourceGit } from "./resourceGitInfo";
import { InstalledEditorsCache, matchesEditorBundle } from "./editors/installedEditors";
import { editorCatalog } from "./editors/editorCatalog";

const execute = promisify(execFile);
const TERMINAL_APP = "/System/Applications/Utilities/Terminal.app";
const hostActions = {
  platform: process.platform,
  inspect: inspectResourceGit,
  openPath: (filename: string) => shell.openPath(filename),
  openExternal: (url: string) => shell.openExternal(url),
  launch: async (application: string, directory: string) => { await execute("/usr/bin/open", ["-a", application, "--", directory], { timeout: 10000, maxBuffer: 64 * 1024 }); },
  matchesEditor: matchesEditorBundle,
  terminalAvailable: async () => { try { return (await stat(TERMINAL_APP)).isDirectory(); } catch { return false; } },
};

export class TaskWorkspaceOpenService {
  constructor(private readonly loadTasks: () => Promise<Task[] | null>, private readonly editors = new InstalledEditorsCache(), private readonly host = hostActions) {}
  private async directory(taskId: string, resourceId: string) {
    if (typeof taskId !== "string" || typeof resourceId !== "string") throw new Error("TASK_INVALID");
    const task = (await this.loadTasks())?.find((item) => item.id === taskId);
    const resource = task?.resources?.find((item) => item.resourceId === resourceId && item.mode !== "folder");
    if (!resource) throw new Error("RESOURCE_NOT_FOUND");
    const directory = await realpath(resource.workingPath);
    if (!(await stat(directory)).isDirectory()) throw new Error("INVALID_DIRECTORY");
    return directory;
  }
  async options(taskId: string, resourceId: string): Promise<WorkspaceOpenOptions> {
    const directory = await this.directory(taskId, resourceId);
    const [editors, git, externalTerminal] = await Promise.all([
      this.editors.list(), this.host.inspect(directory).catch(() => null),
      this.host.platform === "darwin" ? this.host.terminalAvailable() : false,
    ]);
    return { editors: editors.map(({ id, name }) => ({ id, name })), remote: repositoryWebLink(git?.remoteUrl ?? null), externalTerminal };
  }
  async open(taskId: string, resourceId: string, target: WorkspaceOpenTarget) {
    const directory = await this.directory(taskId, resourceId);
    if (!target || typeof target !== "object") throw new Error("TASK_INVALID");
    if (target.kind === "fileManager") {
      if (await this.host.openPath(directory)) throw new Error("WORKSPACE_OPEN_FAILED");
      return;
    }
    if (target.kind === "remote") {
      const remote = repositoryWebLink((await this.host.inspect(directory)).remoteUrl);
      if (!remote) throw new Error("WORKSPACE_REMOTE_UNAVAILABLE");
      await this.host.openExternal(remote.url);return;
    }
    if (this.host.platform !== "darwin") throw new Error("WORKSPACE_OPEN_UNSUPPORTED");
    if (target.kind === "terminal") {
      if (!await this.host.terminalAvailable()) throw new Error("WORKSPACE_OPEN_UNSUPPORTED");
      await this.host.launch(TERMINAL_APP, directory);return;
    }
    if (target.kind !== "editor" || !EDITOR_IDS.includes(target.editorId)) throw new Error("TASK_INVALID");
    const definition = editorCatalog.find((item) => item.id === target.editorId);
    const editor = this.editors.find(target.editorId);
    if (!editor || !definition || !await this.host.matchesEditor(editor.appPath, definition)) {
      this.editors.invalidate();throw new Error("WORKSPACE_EDITOR_UNAVAILABLE");
    }
    await this.host.launch(editor.appPath, directory);
  }
}
