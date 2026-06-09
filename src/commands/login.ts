import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { platform } from "node:os";
import { URL, URLSearchParams } from "node:url";
import kleur from "kleur";

import {
  AuthError,
  fetchWorkerConfig,
  WORKER_URL,
} from "../auth.js";
import { apiGet, ApiError } from "../client.js";
import { saveToken, type TokenCache } from "../config.js";
import { err } from "../render.js";

const AUTHORIZE_URL = "https://api.intra.42.fr/oauth/authorize";
const LISTEN_TIMEOUT_MS = 5 * 60 * 1000;

interface CallbackPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  nonce: string;
}

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function openBrowser(url: string): void {
  const escaped = JSON.stringify(url);
  const cmd =
    platform() === "darwin"
      ? `open ${escaped}`
      : platform() === "win32"
        ? `start "" ${escaped}`
        : `xdg-open ${escaped}`;
  exec(cmd, () => {
    // best-effort; we already print the URL in case it didn't open
  });
}

function htmlPage(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>japonette</title>
<style>body{font-family:system-ui;padding:3rem;max-width:32rem;margin:auto;}</style>
</head><body>${body}</body></html>`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function respondHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

export async function loginCmd(): Promise<void> {
  let workerCfg;
  try {
    workerCfg = await fetchWorkerConfig();
  } catch (e) {
    if (e instanceof AuthError) {
      err(e.message);
      err(
        `If this is a fresh checkout, deploy the worker first (see worker/README.md) and update WORKER_URL in src/auth.ts. WORKER_URL is currently ${WORKER_URL}`,
      );
      process.exit(1);
    }
    throw e;
  }

  // Start the local listener first so we know the port for `state`.
  const nonce = randomBytes(16).toString("hex");

  const pending = awaitCallbackOnFreePort(nonce);
  const { port, result } = await pending;

  const state = base64url(JSON.stringify({ port, nonce }));
  const authorizeUrl =
    `${AUTHORIZE_URL}?` +
    new URLSearchParams({
      client_id: workerCfg.uid,
      redirect_uri: workerCfg.redirect_uri,
      response_type: "code",
      scope: "public",
      state,
    }).toString();

  console.log("Opening your browser to log in with 42…");
  console.log(kleur.dim("If it doesn't open, paste this URL:"));
  console.log(kleur.dim(authorizeUrl));
  openBrowser(authorizeUrl);

  let payload: CallbackPayload;
  try {
    payload = (await result).payload;
  } catch (e) {
    err((e as Error).message);
    process.exit(1);
  }

  const tok: TokenCache = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    token_type: "bearer",
    expires_at: Date.now() + payload.expires_in * 1000,
  };
  saveToken(tok);

  try {
    const me = await apiGet<{ login: string; displayname?: string }>("/v2/me");
    console.log(
      kleur.green("✓") +
        " logged in as " +
        kleur.cyan(me.login) +
        (me.displayname ? kleur.dim(` (${me.displayname})`) : ""),
    );
  } catch (e) {
    if (e instanceof ApiError || e instanceof AuthError) {
      err(
        "Tokens stored, but /v2/me check failed: " + e.message + " — try `japonette me`",
      );
      process.exit(1);
    }
    throw e;
  }
}

async function awaitCallbackOnFreePort(nonce: string): Promise<{
  port: number;
  result: Promise<{
    port: number;
    payload: CallbackPayload;
    close: () => void;
  }>;
}> {
  // We start the server, capture its assigned port, then return BOTH the port
  // and the promise that will eventually resolve when the browser POSTs back.
  return new Promise((resolve, reject) => {
    let settled = false;
    let resultResolve: (v: {
      port: number;
      payload: CallbackPayload;
      close: () => void;
    }) => void = () => {};
    let resultReject: (e: Error) => void = () => {};
    const resultPromise = new Promise<{
      port: number;
      payload: CallbackPayload;
      close: () => void;
    }>((res, rej) => {
      resultResolve = res;
      resultReject = rej;
    });

    const server = createServer(async (req, res) => {
      try {
        if (req.method === "POST" && req.url && req.url.startsWith("/cb")) {
          const body = await readBody(req);
          const params = new URLSearchParams(body);
          const raw = params.get("payload");
          if (!raw) throw new Error("missing payload");
          const parsed = JSON.parse(raw) as Partial<CallbackPayload>;
          if (
            !parsed.access_token ||
            !parsed.refresh_token ||
            typeof parsed.expires_in !== "number" ||
            parsed.nonce !== nonce
          ) {
            throw new Error("invalid payload");
          }
          respondHtml(
            res,
            200,
            htmlPage(
              "<h1>Logged in ✓</h1><p>You can close this tab and return to the terminal.</p>",
            ),
          );
          const port = (server.address() as { port: number }).port;
          server.close();
          resultResolve({
            port,
            payload: parsed as CallbackPayload,
            close: () => server.close(),
          });
          return;
        }
        respondHtml(res, 404, htmlPage("<h1>404</h1>"));
      } catch (e) {
        respondHtml(
          res,
          400,
          htmlPage(`<h1>Login failed</h1><p>${(e as Error).message}</p>`),
        );
        server.close();
        resultReject(e as Error);
      }
    });

    server.on("error", (e) => {
      if (settled) return;
      reject(e);
    });
    server.listen(0, "127.0.0.1", () => {
      if (settled) return;
      settled = true;
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to bind local listener"));
        return;
      }
      const timeoutHandle = setTimeout(() => {
        server.close();
        resultReject(new Error("login timed out — no response from browser"));
      }, LISTEN_TIMEOUT_MS);
      resultPromise.finally(() => clearTimeout(timeoutHandle));
      resolve({ port: address.port, result: resultPromise });
    });
  });
}
