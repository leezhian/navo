import { t } from "@/i18n";
import type { TranslationKey } from "@/i18n/types";

const errors: Record<string, TranslationKey<"agents">> = {
  AGENT_RUNTIME_OUTDATED: "agents:errors.restartRequired",
  AGENT_CAPABILITIES_FAILED: "agents:errors.capabilities",
  AGENT_CAPABILITIES_PENDING: "agents:errors.capabilitiesPending",
  AGENT_INVALID: "agents:errors.invalid", AGENT_INVALID_PATH: "agents:errors.path",
  AGENT_UNAVAILABLE: "agents:errors.unavailable", AGENT_BUSY: "agents:errors.busy",
  AGENT_EXPIRED_PLAN: "agents:errors.expired", AGENT_START_FAILED: "agents:errors.start",
  AGENT_SECURE_STORAGE: "agents:errors.secureStorage", AGENT_STORAGE_FAILED: "agents:errors.storage",
};
export function getAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const key = Object.keys(errors).find((code) => message.includes(code));
  return t(key ? errors[key] : "common:errors.operationFailed");
}
