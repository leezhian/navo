export function getExtensionsApi() {
  if (!window.navo?.extensions) throw Error("EXTENSION_UNAVAILABLE");
  return window.navo.extensions;
}
export function extensionErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const known = [
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
    "SOURCE_MISSING",
    "SOURCE_UNREADABLE",
    "LINE_TOO_LARGE",
    "CACHE_LIMIT",
    "SESSION_MISSING",
    "LEASE_EXPIRED",
    "EVENT_MISSING",
    "EXTENSION_UNAVAILABLE",
  ] as const;
  return known.find((code) => message.endsWith(code)) ?? "OPERATION_FAILED";
}
