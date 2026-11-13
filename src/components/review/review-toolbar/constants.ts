import type { CompareMode } from "@/domain/types";
import type { TranslationKey } from "@/i18n/types";

export const compareModeLabels: Record<CompareMode, TranslationKey<"review">> = {
  unstaged: "review:compare.unstaged",
  staged: "review:compare.staged",
  branch: "review:branches.label",
};
