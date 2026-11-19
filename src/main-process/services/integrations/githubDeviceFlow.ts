import { providerFetch, readJson, ProviderHttpError } from "./httpClient";
import type { ProviderFetch } from "./httpClient";

export interface DeviceCodeStart {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceTokenSuccess {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export type DevicePollResult =
  | { status: "success"; token: DeviceTokenSuccess }
  | { status: "pending"; interval?: number }
  | { status: "denied" }
  | { status: "expired" };

interface DeviceCodeResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function requestGithubDeviceCode(fetchImpl: ProviderFetch, input: { clientId: string; scope?: string; baseUrl?: string }): Promise<DeviceCodeStart> {
  const base = input.baseUrl ?? "https://github.com";
  const response = await providerFetch(fetchImpl, `${base}/login/device/code`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    // OAuth App 设备码请求带上 scope；未提供或为空时只发送 client_id，不带 secret。
    body: JSON.stringify(input.scope ? { client_id: input.clientId, scope: input.scope } : { client_id: input.clientId }),
  });
  if (!response.ok) throw new ProviderHttpError("rejected", undefined, response.status);
  const data = await readJson<DeviceCodeResponse>(response);
  if (!data.device_code || !data.user_code || !data.verification_uri || !data.expires_in) throw new ProviderHttpError("unreadable");
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUrl: data.verification_uri,
    expiresIn: data.expires_in,
    interval: Math.max(5, data.interval ?? 5),
  };
}

export async function pollGithubDeviceToken(fetchImpl: ProviderFetch, input: { clientId: string; deviceCode: string; baseUrl?: string }): Promise<DevicePollResult> {
  const base = input.baseUrl ?? "https://github.com";
  const response = await providerFetch(fetchImpl, `${base}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      device_code: input.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const data = await readJson<TokenResponse>(response);
  if (data.access_token) return { status: "success", token: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, tokenType: data.token_type, scope: data.scope } };
  if (data.error === "authorization_pending") return { status: "pending" };
  if (data.error === "slow_down") return { status: "pending", interval: 5 };
  if (data.error === "access_denied") return { status: "denied" };
  if (data.error === "expired_token") return { status: "expired" };
  if (!response.ok) throw new ProviderHttpError("rejected", undefined, response.status);
  throw new ProviderHttpError("unreadable");
}
