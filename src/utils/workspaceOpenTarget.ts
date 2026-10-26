import { EDITOR_IDS, type WorkspaceOpenOptions, type WorkspaceOpenTarget } from "../shared/workspaceOpenTypes";

export function normalizeWorkspaceOpenTarget(value: unknown): WorkspaceOpenTarget {
  if (value && typeof value === "object") {
    const target = value as WorkspaceOpenTarget;
    if (target.kind === "fileManager" || target.kind === "terminal" || target.kind === "remote") return { kind: target.kind };
    if (target.kind === "editor" && EDITOR_IDS.includes(target.editorId)) return { kind: "editor", editorId: target.editorId };
  }
  return { kind: "fileManager" };
}

export function availableWorkspaceOpenTarget(preferred: WorkspaceOpenTarget, options: WorkspaceOpenOptions | null): WorkspaceOpenTarget {
  const target = normalizeWorkspaceOpenTarget(preferred);
  if (target.kind === "editor" && !options?.editors.some((editor) => editor.id === target.editorId)) return { kind: "fileManager" };
  if (target.kind === "remote" && !options?.remote) return { kind: "fileManager" };
  if (target.kind === "terminal" && !options?.externalTerminal) return { kind: "fileManager" };
  return target;
}
