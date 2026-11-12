import type { TraceKind } from "@/shared/extensionTypes";

/** 事件类型的颜色只用于辅助识别，列表中同时显示类型文字。 */
const tones: Record<TraceKind, { badge: string; mark: string }> = {
  user: { badge: "text-trace-input bg-trace-input/10", mark: "bg-trace-input" },
  system: { badge: "text-trace-input bg-trace-input/10", mark: "bg-trace-input" },
  compaction: { badge: "text-trace-input bg-trace-input/10", mark: "bg-trace-input" },
  unknown: { badge: "text-muted-foreground bg-muted", mark: "bg-muted-foreground" },
  assistant: { badge: "text-trace-model bg-trace-model/10", mark: "bg-trace-model" },
  reasoning: { badge: "text-trace-model bg-trace-model/10", mark: "bg-trace-model" },
  tool: { badge: "text-trace-tool bg-trace-tool/10", mark: "bg-trace-tool" },
  context: { badge: "text-trace-context bg-trace-context/10", mark: "bg-trace-context" },
  error: { badge: "text-destructive bg-destructive/10", mark: "bg-destructive" },
};
export const traceKindTone = (kind: TraceKind) => tones[kind];
