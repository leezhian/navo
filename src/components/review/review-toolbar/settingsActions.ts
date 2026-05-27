import type { AppSettings } from "@/domain/types";

export function updateWrapDiffLines(updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>) {
  updateSettings((current) => ({ ...current, wrapDiffLines: !current.wrapDiffLines }));
}

export function toggleDiffView(updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>) {
  updateSettings((current) => ({
    ...current,
    diffViewMode: current.diffViewMode === "split" ? "unified" : "split",
  }));
}

export function updateTargetBranch(
  targetBranch: string,
  updateSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
) {
  updateSettings((current) => ({ ...current, targetBranch }));
}
