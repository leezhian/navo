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
  /** 宿主接口版本，同时表示轨迹查询协议版本；首版均为 1，不兼容时拒绝安装。 */
  apiVersion: 1;
  hostMajor: number;
  runtime: "runtime/index.cjs";
}
/** 已支持轨迹解析的 Agent；标题栏入口、主进程描述与插件解析共用这一份列表。 */
export const TRACE_PROVIDERS = ["claude", "codex", "grok", "antigravity"] as const;
export type TraceProvider = (typeof TRACE_PROVIDERS)[number];
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
  /** 日志标记工具仍在运行（如 Antigravity 的 RUNNING 结果），耗时未定，不按结果时间推算。 */
  running?: boolean;
  /** 纯记账记录；默认时间线隐藏，可通过「显示全部」查看原文。 */
  bookkeeping?: boolean;
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
  /** 为 true 时包含默认隐藏的记账记录。 */
  showBookkeeping?: boolean;
  /**
   * 框选命中的事件序号。分页找到其中仍通过当前筛选和搜索的最小序号，并打开它所在的窗口。
   * 不收窄列表。时间线查询忽略该字段。
   */
  hitIds?: number[];
  /** 可选的 ISO-8601 起点；与 to 一起时分页结果返回时间段内第一条事件的位置，不过滤列表。时间线查询忽略该字段。 */
  from?: string;
  /** 可选的 ISO-8601 终点，必须晚于 from。 */
  to?: string;
}
export interface TraceStats {
  events: number;
  rounds: number;
  requests: number | null;
  tools: number;
  errors: number;
}
export interface TracePage {
  events: TraceEvent[];
  total: number;
  stats: TraceStats;
  /** 实际分页起点；按事件定位时可能与请求的 offset 不同。 */
  offset?: number;
  /** 带 from/to 查询时，当前筛选结果中第一条落在时间段内的事件下标；没有命中为 null。 */
  rangeFirstIndex?: number | null;
}
export type TraceResult = TracePage | TraceDetail | { events: TraceEvent[]; truncated: boolean };
export type TraceLease = { id: string; cancelled?: false } | { cancelled: true };
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
  /** 会话由主进程核对；调用方预先生成租约 UUID，以便在首次索引完成前关闭请求。租约绑定当前窗口。 */
  openTrace(sessionId: string, leaseId: string): Promise<TraceLease>;
  queryTrace(leaseId: string, query: TraceQuery): Promise<TraceResult>;
  closeTrace(leaseId: string): Promise<void>;
  onTraceChanged(listener: (update: TraceUpdate) => void): () => void;
}
