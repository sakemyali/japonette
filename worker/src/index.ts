interface Env {
  FT_UID: string;
  FT_SECRET: string;
  FT_REDIRECT_URI: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  created_at?: number;
}

const TOKEN_URL = "https://api.intra.42.fr/oauth/token";
const JSON_HEADERS = { "Content-Type": "application/json" };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/config" && req.method === "GET") {
        return handleConfig(env);
      }
      if (url.pathname === "/callback" && req.method === "GET") {
        return handleCallback(req, env);
      }
      if (url.pathname === "/refresh" && req.method === "POST") {
        return handleRefresh(req, env);
      }
      if (url.pathname === "/" || url.pathname === "") {
        return new Response("japonette OAuth broker is up.\n", {
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response("not found", { status: 404 });
    } catch (err) {
      return new Response(
        `worker error: ${err instanceof Error ? err.message : String(err)}`,
        { status: 500 },
      );
    }
  },
} satisfies ExportedHandler<Env>;

function handleConfig(env: Env): Response {
  return new Response(
    JSON.stringify({ uid: env.FT_UID, redirect_uri: env.FT_REDIRECT_URI }),
    { headers: JSON_HEADERS },
  );
}

async function handleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return htmlMessage(
      "Login failed",
      `42 returned an error: ${escapeHtml(oauthError)}. You can close this tab.`,
      400,
    );
  }
  if (!code || !state) {
    return htmlMessage(
      "Login failed",
      "Missing code or state. You can close this tab.",
      400,
    );
  }

  let port: number;
  let nonce: string;
  try {
    const decoded = atob(state.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(decoded) as { port?: unknown; nonce?: unknown };
    if (
      typeof parsed.port !== "number" ||
      !Number.isInteger(parsed.port) ||
      parsed.port < 1 ||
      parsed.port > 65535
    ) {
      throw new Error("bad port");
    }
    if (typeof parsed.nonce !== "string" || parsed.nonce.length < 8) {
      throw new Error("bad nonce");
    }
    port = parsed.port;
    nonce = parsed.nonce;
  } catch {
    return htmlMessage(
      "Login failed",
      "Invalid state parameter. You can close this tab.",
      400,
    );
  }

  const exchange = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.FT_UID,
      client_secret: env.FT_SECRET,
      code,
      redirect_uri: env.FT_REDIRECT_URI,
    }),
  });

  if (!exchange.ok) {
    const txt = await exchange.text();
    return htmlMessage(
      "Login failed",
      `42 token exchange returned ${exchange.status}: ${escapeHtml(
        txt.slice(0, 300),
      )}`,
      502,
    );
  }

  const tok = (await exchange.json()) as OAuthTokenResponse;

  const payload = JSON.stringify({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? "",
    expires_in: tok.expires_in,
    nonce,
  });

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>japonette — logged in</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 3rem; max-width: 32rem; margin: auto; }
  h1 { font-size: 1.4rem; }
  p { color: #555; }
  noscript { color: #b00; }
</style></head>
<body>
  <h1>Logged in ✓</h1>
  <p>Handing your session back to the CLI… You can close this tab.</p>
  <noscript>JavaScript is required to complete the handoff. Please enable it and reload, or run <code>japonette login</code> again.</noscript>
  <form id="f" action="http://127.0.0.1:${port}/cb" method="POST">
    <input type="hidden" name="payload" value="${escapeHtml(payload)}">
  </form>
  <script>document.getElementById("f").submit();</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handleRefresh(req: Request, env: Env): Promise<Response> {
  let body: { refresh_token?: string };
  try {
    body = (await req.json()) as { refresh_token?: string };
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }
  const refresh_token = String(body.refresh_token ?? "");
  if (!refresh_token) {
    return new Response(JSON.stringify({ error: "missing refresh_token" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.FT_UID,
      client_secret: env.FT_SECRET,
      refresh_token,
    }),
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: JSON_HEADERS,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlMessage(title: string, message: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui;padding:3rem;max-width:32rem;margin:auto;}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${message}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
