# japonette-worker

Tiny Cloudflare Worker that brokers 42 OAuth for the [japonette](../) CLI.

## What it does

Three stateless endpoints. No storage, no database, no per-user state.

| Endpoint        | Purpose                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `GET /config`   | Returns `{ uid, redirect_uri }` so the CLI can avoid hard-coding them.                 |
| `GET /callback` | Receives the OAuth `code` from 42, exchanges it (using `FT_SECRET`), hands tokens to the CLI via an auto-POST HTML form that targets `http://127.0.0.1:<port>/cb`. Port comes from the OAuth `state`. |
| `POST /refresh` | Body `{ refresh_token }`. Trades it for new tokens via 42. Returns the new pair.       |

The `FT_SECRET` lives only as a Cloudflare encrypted secret. It is never
exposed to any HTTP response.

## Deploy

One-time setup (you need a free Cloudflare account):

```bash
cd worker
npm install
npx wrangler login                 # opens browser, logs into your Cloudflare account
```

Set the secret:

```bash
npx wrangler secret put FT_SECRET  # paste your 42 app SECRET when prompted
```

Edit `wrangler.toml`:

- `FT_UID` → your 42 app's UID (public client id).
- `FT_REDIRECT_URI` → the URL you'll deploy to. If you've never used this
  Cloudflare account before, the worker URL will be
  `https://japonette.<your-cf-username>.workers.dev/callback`. The
  `<your-cf-username>` is shown the first time you run `wrangler deploy`.

Deploy:

```bash
npx wrangler deploy
```

After the first deploy you'll see the actual URL. If the `FT_REDIRECT_URI`
in `wrangler.toml` doesn't match it, update and redeploy.

Then go to <https://profile.intra.42.fr/oauth/applications> and set your
app's redirect URI to that exact URL (the `/callback` one).

Finally, in the parent project, update the `WORKER_URL` constant in
`src/auth.ts` to match the deployed URL, then `npm run build` and (optionally)
`npm publish`.

## Local dev

```bash
npx wrangler dev
```

Hits `http://localhost:8787`. You'll need to either put a tunnel in front of
it for the OAuth callback to work end-to-end, or test individual endpoints
with `curl`.

## Verify after deploy

```bash
curl https://japonette.<your-cf-username>.workers.dev/config
# → {"uid":"...","redirect_uri":"..."}
```

## Why a worker and not just `client_credentials`

`client_credentials` would mean the npm-published CLI carries your 42 app's
SECRET. Published JS is plain text. Anyone who ran `cat $(which japonette)`
could lift it, abuse your app's quota, and get your app revoked by 42. The
Worker exists so the SECRET stays server-side, while end users still log in
with their own 42 accounts.
