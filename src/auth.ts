import { loadToken, saveToken, type TokenCache } from "./config.js";

// The Cloudflare Worker that brokers the OAuth code/refresh exchange.
// Update this constant after deploying the worker (see worker/README.md).
export const WORKER_URL =
  process.env.JAPONETTE_WORKER_URL ??
  "https://japonette.emoulayali54.workers.dev";

const SAFETY_MARGIN_MS = 60_000;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function getToken(): Promise<string> {
  const cached = loadToken();
  if (!cached) {
    throw new AuthError("not logged in — run `japonette login`");
  }
  if (cached.expires_at - Date.now() > SAFETY_MARGIN_MS) {
    return cached.access_token;
  }
  return await refreshThroughWorker(cached.refresh_token);
}

export async function refreshThroughWorker(refresh_token: string): Promise<string> {
  const resp = await fetch(`${WORKER_URL}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });
  if (!resp.ok) {
    throw new AuthError(
      `refresh failed (${resp.status}) — run \`japonette login\` again`,
    );
  }
  const data = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new AuthError("refresh returned malformed response");
  }
  const tok: TokenCache = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    token_type: data.token_type ?? "bearer",
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveToken(tok);
  return tok.access_token;
}

export interface WorkerConfig {
  uid: string;
  redirect_uri: string;
}

export async function fetchWorkerConfig(): Promise<WorkerConfig> {
  const resp = await fetch(`${WORKER_URL}/config`);
  if (!resp.ok) {
    throw new AuthError(
      `could not reach OAuth broker at ${WORKER_URL} (${resp.status})`,
    );
  }
  const data = (await resp.json()) as Partial<WorkerConfig>;
  if (!data.uid || !data.redirect_uri) {
    throw new AuthError("OAuth broker returned malformed config");
  }
  return { uid: data.uid, redirect_uri: data.redirect_uri };
}
