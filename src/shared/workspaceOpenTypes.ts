export const EDITOR_IDS = ["vscode", "vscode-insiders", "vscodium", "cursor", "windsurf", "xcode", "idea", "webstorm", "pycharm", "goland", "clion", "rider", "phpstorm", "rustrover", "android-studio", "zed", "sublime"] as const;
export type EditorId = typeof EDITOR_IDS[number];
export interface InstalledEditor { id: EditorId; name: string; }
export interface RepositoryWebLink { provider: string; url: string; }
export interface WorkspaceOpenOptions {
  editors: InstalledEditor[];
  remote: RepositoryWebLink | null;
  externalTerminal: boolean;
}
export type WorkspaceOpenTarget = { kind: "fileManager" | "terminal" | "remote" } | { kind: "editor"; editorId: EditorId };
