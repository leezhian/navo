import { invoke } from "@tauri-apps/api/core";

export function getFullPath(projectPath: string, filePath: string) {
  return `${projectPath.replace(/\/$/, "")}/${filePath}`;
}

export function copyFilePath(filePath: string) {
  void navigator.clipboard?.writeText(filePath);
}

export function openFileInVsCode(projectPath: string, filePath: string) {
  void invoke("open_file_in_vscode", { projectPath, filePath });
}
