# japonette

A small CLI for the 42 API. Two daily-use jobs:

1. **See who's currently active** at a campus.
2. **Maintain a local friends watchlist** and check who's online.

> The 42 API has no native "friends" concept. The friends list is stored
> locally in `~/.config/42-cli/friends.json`. The CLI never writes to 42's
> servers.

## Install

```bash
npm install -g japonette
```

Requires Node.js ≥ 18.

## First-time setup

```bash
japonette login
```

This opens your browser, sends you through 42's OAuth, and stores a
user-scoped token at `~/.config/42-cli/token.json` (mode `0600`).

You never need a 42 API app of your own. A tiny OAuth broker (deployed
once by the maintainer of this CLI) holds the app credentials server-side;
your laptop only sees a token bound to **your** 42 account, with your own
1200 req/hour quota.

## Usage

```bash
japonette whoami                              # verify the cached token
japonette user <login>                        # profile card

japonette campus list                         # list all campuses
japonette campus set paris                    # set default campus

japonette active                              # who's logged in right now (default campus)
japonette active --campus paris -n 30         # explicit campus, top 30

japonette friends add <login>                 # validates the login exists, then stores it locally
japonette friends remove <login>
japonette friends list
japonette friends online                      # which friends are active at the campus right now

japonette logout                              # delete the local tokens
```

## Auth model

```
your laptop  ──▶  browser  ──▶  intra.42.fr  ──▶  Cloudflare Worker  ──▶  intra
   (CLI)            (login)        (issue code)        (exchange code        (issue token)
                                                        with SECRET)
   ◀────────────────────────────────────── tokens to localhost ────────────────────────
```

- `client_secret` lives only in a Cloudflare Worker the maintainer deploys.
- `client_id` is public (it's in your browser URL during login anyway).
- Access tokens expire in ~2h and are refreshed transparently by hitting the
  Worker's `/refresh` endpoint with your stored refresh token.

## Rate limits

42 enforces 2 req/sec, 1200/hour per app **but tokens issued through the
authorization_code flow get per-user quotas**. The CLI paces local requests at
0.5s and retries once on `429`.

## Develop (CLI)

```bash
npm install            # install deps
npm run dev -- --help  # run from source via tsx
npm test               # vitest unit tests
npm run build          # compile to dist/
```

## Develop / deploy (broker — only the maintainer)

See [`worker/README.md`](worker/README.md). Quick version:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put FT_SECRET   # paste your 42 app secret
# edit wrangler.toml: set FT_UID and FT_REDIRECT_URI
npx wrangler deploy
```

Then, in `src/auth.ts`, set `WORKER_URL` to the deployed URL and
`npm run build` (and optionally `npm publish`).

You can override the broker URL at runtime via the `JAPONETTE_WORKER_URL`
environment variable — useful for testing against a staging worker without
rebuilding.

## Layout

- `src/` — TypeScript source, compiled to `dist/` for publish.
- `worker/` — Cloudflare Worker that brokers the OAuth code/refresh exchange.
- `tests/` — vitest unit tests.
- `python-reference/` — early Python prototype. Reference only; not published.

## License

MIT.
