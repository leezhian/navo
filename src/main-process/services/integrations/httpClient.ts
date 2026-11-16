export class ProviderHttpError extends Error {
  constructor(readonly code: "rateLimited" | "unauthorized" | "forbidden" | "notFound" | "unreachable" | "tls" | "unreadable" | "rejected", readonly retryAfterMs?: number, readonly status?: number) {
    super(code);
    this.name = "ProviderHttpError";
  }
}

export type ProviderFetch = (url: string, init?: RequestInit) => Promise<Response>;

function retryAfterMs(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return 60_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 60_000;
}

export async function providerFetch(fetchImpl: ProviderFetch, url: string, init: RequestInit = {}) {
  let response: Response;
  try { response = await fetchImpl(url, init); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/certificate|CERT_|SSL|TLS|unable to verify/i.test(message)) throw new ProviderHttpError("tls");
    throw new ProviderHttpError("unreachable");
  }
  if (response.status === 429) throw new ProviderHttpError("rateLimited", retryAfterMs(response), 429);
  if (response.status === 401) throw new ProviderHttpError("unauthorized", undefined, 401);
  if (response.status === 403) throw new ProviderHttpError("forbidden", undefined, 403);
  if (response.status === 404) throw new ProviderHttpError("notFound", undefined, 404);
  return response;
}

export async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new ProviderHttpError("unreadable", undefined, response.status); }
}

export async function readText(response: Response) {
  try { return await response.text(); }
  catch { throw new ProviderHttpError("unreadable", undefined, response.status); }
}
