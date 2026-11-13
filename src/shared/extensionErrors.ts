/** 宿主与渲染进程共用的错误协议；未知异常不直接作为翻译 key。 */
export const extensionErrorCodes = [
  "CATALOG_INVALID",
  "UPDATE_CHECK_FAILED",
  "NO_COMPATIBLE_RELEASE",
  "UPDATE_ROLLBACK_FAILED",
  "PACKAGE_INVALID",
  "INCOMPATIBLE",
  "RELEASE_UNAVAILABLE",
  "DOWNLOAD_FAILED",
  "CLEANUP_REQUIRED",
  "INVALID_STORAGE",
  "RUNTIME_FAILED",
  "RUNTIME_TIMEOUT",
  "EXTENSION_DISABLED",
  "IDENTITY_PENDING",
  "UNSUPPORTED_PROVIDER",
  "SOURCE_INVALID",
  "SOURCE_ROOT_MISSING",
  "SOURCE_MISSING",
  "SOURCE_UNREADABLE",
  "LINE_TOO_LARGE",
  "CACHE_LIMIT",
  "SESSION_MISSING",
  "LEASE_EXPIRED",
  "EVENT_MISSING",
  "EXTENSION_UNAVAILABLE",
  "OPERATION_FAILED",
  "BUSY",
  "INVALID_QUERY",
] as const;
export type ExtensionErrorCode = (typeof extensionErrorCodes)[number];

export function normalizeExtensionErrorCode(value: unknown): ExtensionErrorCode {
  return extensionErrorCodes.find((code) => code === value) ?? "OPERATION_FAILED";
}
