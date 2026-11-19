import type { IntegrationProviderId } from "../../../shared/integrationTypes";

const ENV_KEYS: Partial<Record<IntegrationProviderId, string>> = {
  github: "NAVO_GITHUB_OAUTH_CLIENT_ID",
  gitlab: "NAVO_GITLAB_OAUTH_CLIENT_ID",
  linear: "NAVO_LINEAR_OAUTH_CLIENT_ID",
};

/** 内置的公开 client id；不包含任何 client secret。环境变量可覆盖。 */
const DEFAULT_CLIENT_IDS: Partial<Record<IntegrationProviderId, string>> = {
  github: "Ov23liJXHo8fBZzJ6hm9",
  gitlab: "b880924bedac9d391abdc1e7a4f1224ee8f39b53d1f2165b5aa368febe20a231",
  linear: "63078eb39b9fff45aa075ac633f5cfa0",
};

export function oauthClientId(id: IntegrationProviderId): string {
  const key = ENV_KEYS[id];
  if (!key) return "";
  const value = process.env[key];
  const override = typeof value === "string" ? value.trim() : "";
  return override || DEFAULT_CLIENT_IDS[id] || "";
}

export function oauthAvailable(id: IntegrationProviderId) {
  return oauthClientId(id).length > 0;
}
