import type { ExtensionErrorCode } from "./extensionErrors";

export type ExtensionOperation = "idle" | "installing" | "updating" | "uninstalling";
export interface ExtensionStatus {
  id: "session-trace";
  version: string | null;
  availableVersion: string;
  downloadBytes: number;
  /** 仅提示比已安装版本更新、且通过签名与兼容性校验的版本。 */
  updateAvailable: boolean;
  checking: boolean;
  checkedAt: string | null;
  updateError: ExtensionErrorCode | null;
  enabled: boolean;
  compatible: boolean;
  operation: ExtensionOperation;
  progress: number;
  error: ExtensionErrorCode | null;
}
export interface ExtensionManifest {
  id: "session-trace";
  version: string;
  apiVersion: 1;
  hostMajor: number;
  ui: "ui/index.html";
  runtime: "runtime/index.cjs";
}
export type TraceKind = "user" | "assistant" | "reasoning" | "context" | "system" | "tool" | "error" | "compaction" | "unknown";
export interface TraceEvent {
  id: number;
  kind: TraceKind;
  round: number;
  request?: string;
  timestamp?: string;
  durationMs?: number;
  preview: string;
  tool?: string;
  callId?: string;
  synthetic?: boolean;
}
export interface TraceDetail extends TraceEvent {
  content: string;
  result?: string;
  raw: string;
  truncated: boolean;
}
export interface TraceQuery {
  kind: "page" | "detail" | "timeline";
  offset?: number;
  limit?: number;
  filter?: TraceKind | "all";
  search?: string;
  eventId?: number;
}
export interface TraceStats {
  events: number;
  rounds: number;
  requests: number | null;
  tools: number;
  errors: number;
  tokens: number | null;
  start?: string;
  end?: string;
}
export interface TracePage {
  events: TraceEvent[];
  total: number;
  stats: TraceStats;
}
export type TraceResult = TracePage | TraceDetail | { events: TraceEvent[]; truncated: boolean };
export interface TraceLease {
  id: string;
  uiUrl: string;
}
export interface TraceUpdate {
  leaseId: string;
  error?: string;
}
export interface ExtensionsApi {
  status(): Promise<ExtensionStatus>;
  /** 仅下载宿主内置或经过签名验证的官方版本；本地文件由原生选择器选择并校验同一摘要。 */
  install(source: "download" | "file"): Promise<void>;
  checkForUpdates(): Promise<void>;
  update(): Promise<void>;
  /** 取消安装或更新；已进入提交阶段时，以实际完成结果为准。 */
  cancelInstall(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  uninstall(): Promise<void>;
  onChanged(listener: (status: ExtensionStatus) => void): () => void;
  /** 会话 ID 由主进程核对；租约绑定调用窗口，关闭后拒绝全部请求。 */
  openTrace(sessionId: string): Promise<TraceLease>;
  queryTrace(leaseId: string, query: TraceQuery): Promise<TraceResult>;
  closeTrace(leaseId: string): Promise<void>;
  onTraceChanged(listener: (update: TraceUpdate) => void): () => void;
}
