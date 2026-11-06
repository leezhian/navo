import type { TranslationKey } from "@/i18n/types";
import type { ExtensionErrorCode } from "@/shared/extensionErrors";

export const extensionErrorKeys = {
  CATALOG_INVALID: "settings:labs.errors.CATALOG_INVALID",
  UPDATE_CHECK_FAILED: "settings:labs.errors.UPDATE_CHECK_FAILED",
  NO_COMPATIBLE_RELEASE: "settings:labs.errors.NO_COMPATIBLE_RELEASE",
  UPDATE_ROLLBACK_FAILED: "settings:labs.errors.UPDATE_ROLLBACK_FAILED",

  PACKAGE_INVALID: "settings:labs.errors.PACKAGE_INVALID",
  INCOMPATIBLE: "settings:labs.errors.INCOMPATIBLE",
  RELEASE_UNAVAILABLE: "settings:labs.errors.RELEASE_UNAVAILABLE",
  DOWNLOAD_FAILED: "settings:labs.errors.DOWNLOAD_FAILED",
  CLEANUP_REQUIRED: "settings:labs.errors.CLEANUP_REQUIRED",
  INVALID_STORAGE: "settings:labs.errors.INVALID_STORAGE",
  RUNTIME_FAILED: "settings:labs.errors.RUNTIME_FAILED",
  RUNTIME_TIMEOUT: "settings:labs.errors.RUNTIME_TIMEOUT",
  EXTENSION_DISABLED: "settings:labs.errors.EXTENSION_DISABLED",
  IDENTITY_PENDING: "settings:labs.errors.IDENTITY_PENDING",
  UNSUPPORTED_PROVIDER: "settings:labs.errors.UNSUPPORTED_PROVIDER",
  SOURCE_INVALID: "settings:labs.errors.SOURCE_INVALID",
  SOURCE_MISSING: "settings:labs.errors.SOURCE_MISSING",
  SOURCE_UNREADABLE: "settings:labs.errors.SOURCE_UNREADABLE",
  LINE_TOO_LARGE: "settings:labs.errors.LINE_TOO_LARGE",
  CACHE_LIMIT: "settings:labs.errors.CACHE_LIMIT",
  SESSION_MISSING: "settings:labs.errors.SESSION_MISSING",
  LEASE_EXPIRED: "settings:labs.errors.LEASE_EXPIRED",
  EVENT_MISSING: "settings:labs.errors.EVENT_MISSING",
  EXTENSION_UNAVAILABLE: "settings:labs.errors.EXTENSION_UNAVAILABLE",
  OPERATION_FAILED: "settings:labs.errors.OPERATION_FAILED",
  BUSY: "settings:labs.errors.BUSY",
  INVALID_QUERY: "settings:labs.errors.INVALID_QUERY",
} satisfies Record<ExtensionErrorCode, TranslationKey<"settings">>;
