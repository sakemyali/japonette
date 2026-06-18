import { getToken } from "./auth.js";

const BASE_URL = "https://api.intra.42.fr";
const MIN_SPACING_MS = 500;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API error ${status}: ${body.slice(0, 200)}`);
    this.name = "ApiError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let lastRequestAt = 0;

async function pace(): Promise<void> {
  const delta = Date.now() - lastRequestAt;
  if (delta < MIN_SPACING_MS) await sleep(MIN_SPACING_MS - delta);
}

function buildUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

// Shared request core: paced, with one retry that handles a 429 (honouring
// Retry-After) and a 401 (expiring the cached token so getToken() refreshes).
// `body`, when present, is sent as JSON. Returns the parsed JSON, or undefined
// for an empty body (e.g. a 204 from DELETE).
async function request<T>(
  method: string,
  path: string,
  opts: { params?: Record<string, string | number>; body?: unknown } = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await pace();
    const token = await getToken();
    const resp = await fetch(buildUrl(path, opts.params), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    lastRequestAt = Date.now();

    if (resp.status === 429 && attempt === 0) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "1");
      await sleep(Math.max(retryAfter * 1000, 500));
      continue;
    }
    if (resp.status === 401 && attempt === 0) {
      // Expire the cached token so the next getToken() refreshes via the worker.
      const { loadToken, saveToken } = await import("./config.js");
      const cached = loadToken();
      if (cached) saveToken({ ...cached, expires_at: 0 });
      continue;
    }
    if (!resp.ok) {
      const txt = await resp.text();
      throw new ApiError(resp.status, txt);
    }
    const txt = await resp.text();
    return (txt ? JSON.parse(txt) : undefined) as T;
  }
  throw new ApiError(0, "exhausted retries");
}

export function apiGet<T = any>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  return request<T>("GET", path, { params });
}

export function apiPost<T = any>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, { body });
}

export function apiDelete<T = any>(path: string): Promise<T> {
  return request<T>("DELETE", path, {});
}

export async function* paginate<T>(
  path: string,
  params: Record<string, string | number> = {},
  pageSize = 100,
): AsyncGenerator<T> {
  let page = 1;
  while (true) {
    const chunk = await apiGet<T[] | any>(path, {
      ...params,
      "page[number]": page,
      "page[size]": pageSize,
    });
    if (!Array.isArray(chunk)) {
      yield chunk as T;
      return;
    }
    for (const item of chunk) yield item;
    if (chunk.length < pageSize) return;
    page += 1;
  }
}
