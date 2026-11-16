import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { providerFetch, readJson, ProviderHttpError } from "./httpClient";
import type { ProviderFetch } from "./httpClient";

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createOAuthState() {
  return randomBytes(16).toString("hex");
}

/** 恒定时间比较，避免通过响应时延探测 state。长度不同时仍做一次比较后返回 false。 */
export function timingSafeEqualText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function buildAuthorizeUrl(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

export interface LoopbackResult {
  code: string;
  state: string;
  redirectUri: string;
}

export interface LoopbackListener {
  port: number;
  redirectUri: string;
  result: Promise<LoopbackResult>;
  close: () => Promise<void>;
}

/** GitLab.com 与 Linear 共用的固定回环回调，需在平台应用里登记同一地址。 */
export const OAUTH_LOOPBACK_PORT = 58764;
export const OAUTH_LOOPBACK_REDIRECT_URI = `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}/callback`;
export const OAUTH_LOOPBACK_TIMEOUT_MS = 5 * 60_000;

/** 在 127.0.0.1 固定端口等待一次 GET /callback；端口占用时立即失败。 */
export function startLoopbackListener(input: {
  expectedState: string;
  timeoutMs?: number;
  successHtml: string;
  failureHtml: string;
  port?: number;
}): Promise<LoopbackListener> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const timeoutMs = input.timeoutMs ?? OAUTH_LOOPBACK_TIMEOUT_MS;
    const port = input.port === undefined ? OAUTH_LOOPBACK_PORT : input.port;
    let settled = false;
    let consumed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveResult: (value: LoopbackResult) => void;
    let rejectResult: (error: Error) => void;
    const result = new Promise<LoopbackResult>((resolveOk, rejectOk) => {
      resolveResult = resolveOk;
      rejectResult = rejectOk;
    });

    const close = () => new Promise<void>((done) => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (!server.listening) { done(); return; }
      server.close(() => done());
    });

    const finish = (error?: Error, value?: LoopbackResult) => {
      if (settled) { void close(); return; }
      settled = true;
      void close();
      if (error) rejectResult(error);
      else if (value) resolveResult(value);
    };

    server.on("request", (request, response) => {
      try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method !== "GET") {
          response.writeHead(405, { Allow: "GET" });
          response.end();
          return;
        }
        if (url.pathname !== "/callback") {
          response.statusCode = 404;
          response.end();
          return;
        }
        if (consumed || settled) {
          response.statusCode = 409;
          response.end();
          return;
        }
        consumed = true;
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code") ?? "";
        const state = url.searchParams.get("state") ?? "";
        if (!timingSafeEqualText(state, input.expectedState)) {
          response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          response.end(input.failureHtml);
          finish(new Error("INTEGRATION_AUTH_FAILED"));
          return;
        }
        if (error === "access_denied" || !code) {
          response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          response.end(input.failureHtml);
          finish(new Error(error === "access_denied" ? "INTEGRATION_AUTH_DENIED" : "INTEGRATION_AUTH_FAILED"));
          return;
        }
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(input.successHtml);
        const address = server.address();
        const boundPort = address && typeof address !== "string" ? address.port : port;
        finish(undefined, { code, state, redirectUri: `http://127.0.0.1:${boundPort}/callback` });
      } catch {
        response.statusCode = 400;
        response.end();
        finish(new Error("INTEGRATION_AUTH_FAILED"));
      }
    });

    server.on("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      reject(new Error(code === "EADDRINUSE" ? "INTEGRATION_AUTH_PORT_BUSY" : "INTEGRATION_AUTH_FAILED"));
    });

    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        void close();
        reject(new Error("INTEGRATION_AUTH_FAILED"));
        return;
      }
      timer = setTimeout(() => finish(new Error("INTEGRATION_AUTH_EXPIRED")), timeoutMs);
      resolve({
        port: address.port,
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        result,
        close: async () => {
          finish(new Error("INTEGRATION_AUTH_CANCELLED"));
        },
      });
    });
  });
}

export async function exchangeAuthorizationCode(fetchImpl: ProviderFetch, input: {
  tokenUrl: string;
  clientId: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number; scope?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  });
  let response: Response;
  try {
    response = await fetchImpl(input.tokenUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new ProviderHttpError("unreachable");
  }
  const data = await readJson<{ access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }>(response);
  const reason = `${data.error ?? ""} ${data.error_description ?? ""}`;
  if (/client_secret|invalid_client|unauthorized_client/i.test(reason)) {
    throw new Error("INTEGRATION_OAUTH_SECRET_REQUIRED");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 400) throw new ProviderHttpError("rejected", undefined, response.status);
    throw new ProviderHttpError("unreadable", undefined, response.status);
  }
  if (!data.access_token) throw new ProviderHttpError(data.error === "access_denied" ? "rejected" : "unreadable");
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, scope: data.scope };
}

export async function refreshAccessToken(fetchImpl: ProviderFetch, input: { tokenUrl: string; clientId: string; refreshToken: string }) {
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: input.clientId, refresh_token: input.refreshToken });
  const response = await providerFetch(fetchImpl, input.tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new ProviderHttpError(response.status === 401 ? "unauthorized" : "rejected", undefined, response.status);
  const data = await readJson<{ access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }>(response);
  if (!data.access_token) throw new ProviderHttpError("unauthorized");
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? input.refreshToken, expiresIn: data.expires_in, scope: data.scope };
}
