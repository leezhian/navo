import type { CompareMode } from "@/domain/types";

export const compareModeLabels: Record<CompareMode, string> = {
  unstaged: "未暂存",
  staged: "已暂存",
  branch: "分支",
};
