export function getFullPath(projectPath: string, filePath: string) {
  return `${projectPath.replace(/\/$/, "")}/${filePath}`;
}

export function copyFilePath(filePath: string) {
  void navigator.clipboard?.writeText(filePath);
}

export function openFileInVsCode(projectPath: string, filePath: string) {
  void window.navo.review.openFileInVsCode({ projectPath, filePath });
}
