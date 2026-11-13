import { extensionErrorCodes } from "@/shared/extensionErrors";

export function getExtensionsApi() {
  if (!window.navo?.extensions) throw Error("EXTENSION_UNAVAILABLE");
  return window.navo.extensions;
}
export function extensionErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return extensionErrorCodes.find((code) => message === code || message.endsWith(": " + code)) ?? "OPERATION_FAILED";
}
