# japonette

> A tiny CLI for the [42 intra API](https://api.intra.42.fr). See who's at
> your campus right now, look up profiles, and keep a personal "friends"
> watchlist — all from your terminal.

```bash
$ japonette active
✓ auto-detected your campus from /v2/me: tokyo
┌──────────┬──────────────┬──────────────────┬──────────┐
│ login    │ host         │ since            │ duration │
├──────────┼──────────────┼──────────────────┼──────────┤
│ alice    │ e1r2p3       │ 2026-05-23 18:04 │   1h32m  │
│ bob      │ e2r4p1       │ 2026-05-23 19:11 │   0h25m  │
│ charlie  │ e1r1p2       │ 2026-05-23 19:30 │   0h06m  │
└──────────┴──────────────┴──────────────────┴──────────┘
```

## Why use it

The intra web UI is great but slow. If you just want to know **who's online
right now** or **whether a friend is on campus** before walking over, the
terminal is faster. `japonette` is built around two tiny jobs:

- `japonette active` — who's logged into a workstation at your campus.
- `japonette friends online` — which of *your* watchlist of 42 logins is on.

There's also `user`, `campus`, `whoami`, etc. Everything is read-only — the
CLI never writes anything to 42's servers.

## Install

### Just want to try it once

```bash
npx japonette --help
```

`npx` downloads on each call, so this is fine for a one-shot but slow for
daily use.

### Install for daily use

```bash
npm install -g japonette
```

Requires **Node.js ≥ 18** (uses the built-in `fetch` and a couple of modern
APIs). To check: `node --version`. If you're on an older Node, install one
via [`nvm`](https://github.com/nvm-sh/nvm) or your OS package manager.

### Update

```bash
npm update -g japonette            # pull the latest published version
npm install -g japonette@latest    # same thing, more explicit
```

Check what you're on with `japonette --version`, and what's published with
`npm view japonette version`.

### Uninstall

```bash
japonette uninstall              # delete local state at ~/.config/42-cli/
npm uninstall -g japonette       # remove the binary (skip if you used npx only)
```

`japonette uninstall` prompts for confirmation. Pass `-y` / `--yes` to skip
it in scripts. It removes your saved config, OAuth tokens, friends
watchlist, and the campus cache — but does not call any 42 API or revoke
the token server-side (use `japonette logout` first if you want both).

## First-time setup

You **do not need** a 42 API app of your own. The CLI uses a hosted OAuth
broker so you can just log in with your 42 account.

```bash
japonette login
```

That command:

1. Prints a URL and tries to open your default browser.
2. You log in on `intra.42.fr` as you normally would.
3. 42 redirects to the broker, which exchanges the code for a token bound
   to **your** account.
4. The browser hands the token back to a temporary localhost listener.
5. The terminal prints `✓ logged in as <your-login>`.

If your browser didn't open automatically (SSH session, headless, etc.),
copy the printed URL into any browser — same flow, same result.

Then verify:

```bash
japonette whoami
```

Should show your token's scope and lifetime, plus a profile card with your
cursus + piscine levels.

## What each command does

```bash
# Auth
japonette login                       # browser-based 42 OAuth, ~10 seconds
japonette logout                      # delete the local tokens (no API call)
japonette whoami                      # token info + your profile card
japonette uninstall [-y]              # wipe ALL local state at ~/.config/42-cli/

# Profiles
japonette user <login>                # any 42 user — login, name, levels, campus

# Campus
japonette campus                      # show your default (auto-detects on first run)
japonette campus list                 # all ~50 campuses with their slugs
japonette campus list --refresh       # bypass the local cache
japonette campus set paris            # change your default

# Active locations (who's at a workstation right now)
japonette active                      # default campus, top 50 by most recent login
japonette active --campus paris       # any campus by slug
japonette active -n 10                # limit rows

# Friends (LOCAL watchlist — the 42 API has no friends concept)
japonette friends add <login>         # validates the login exists, then stores it locally
japonette friends remove <login>
japonette friends list                # all your friends with their display name
japonette friends online              # which friends are at the campus right now
```

`japonette --help` and `japonette <command> --help` show flags for any
command.

## Examples

**Daily "is anyone at the lab" check**:

```bash
japonette active | head
```

**Build a small watchlist of people you team with**:

```bash
japonette friends add alice
japonette friends add bob
japonette friends add charlie
japonette friends online   # now check this any time you head to campus
```

**Check the level of a friend at another campus**:

```bash
japonette user norminette
```

**Switch campus temporarily** without changing your default:

```bash
japonette active --campus paris
```

## What gets stored, and where

`japonette` never sends anything to a third party other than (a) the 42 API
itself and (b) the OAuth broker (only during login and token refresh).
Everything else lives on **your laptop** under `~/.config/42-cli/`:

| File              | What's in it                                            | Permissions |
| ----------------- | ------------------------------------------------------- | ----------- |
| `config.json`     | Your default campus slug.                               | `0600`      |
| `token.json`      | OAuth access + refresh token, expiry.                   | `0600`      |
| `campuses.json`   | Cached `/v2/campus` payload so listings are instant.    | default     |
| `friends.json`    | Your local watchlist of logins.                         | default     |

`japonette logout` deletes `token.json`. Removing the whole directory is
also fine — the CLI will re-create it.

## Troubleshooting

**`japonette login` says it opened my browser but nothing happened.**
Copy the URL it printed and paste it into any browser. Same flow.

**`login timed out — no response from browser`.**
The localhost listener has a 5-minute window. If something blocked the
browser from reaching `127.0.0.1` (over-eager firewall, container without
host networking, etc.), the listener will give up. Re-run `japonette
login` and try in a normal terminal session.

**`refresh failed — run \`japonette login\` again`.**
Your refresh token was revoked (e.g. you logged out of intra everywhere)
or the broker is having a bad day. `japonette logout && japonette login`
gets you back.

**Anything else: `API error 401`, `429`, etc.**
- `401` → token went stale unexpectedly; re-login.
- `429` → you hit 42's rate limit (2 req/s, 1200/hour). The CLI paces
  itself but some loops still trip this. Wait a minute.

**Corporate / school proxy.**
The CLI uses Node's `fetch`, which honors `HTTPS_PROXY` if set in your
environment. If you can't reach `https://api.intra.42.fr` from your
terminal, the CLI can't either.

## How auth actually works

If you care about the architecture:

```
your laptop  ──▶  browser  ──▶  intra.42.fr  ──▶  Cloudflare Worker  ──▶  intra
   (CLI)            (login)        (issue code)        (exchange code        (issue token)
                                                        with SECRET)
   ◀────────────────────────────────────── tokens to localhost ────────────────────────
```

- `client_secret` lives only in a Cloudflare Worker (the broker). It is
  never bundled into the npm package.
- `client_id` is public (it's in your browser's URL during login anyway).
- Access tokens expire in ~2h and are refreshed transparently by hitting
  the broker's `/refresh` with your stored refresh token. The broker is
  stateless — it does the exchange and forgets.

## Rate limits

42 enforces **2 req/sec, 1200/hour per app**. All `japonette` users share
that bucket since the broker app is the same — but normal use is
nowhere near it (a typical `japonette active` is one request). The CLI
paces local requests at 0.5s and retries once on `429`. If you hit a 429
in normal use, please open an issue.

## Contributing

Issues and PRs are welcome on
<https://github.com/sakemyali/japonette>.

### Reporting bugs

Open an issue with:

- What you ran (`japonette <command> <args>`).
- What you expected.
- What happened (including any error message).
- `node --version` and your OS.

Don't include your token file, your UID/SECRET, or any output from
`japonette whoami` — those contain identifiers.

### Dev setup

```bash
git clone https://github.com/sakemyali/japonette
cd japonette
npm install
```

Common commands:

```bash
npm run dev -- --help     # run the CLI from source via tsx
npm run build             # compile src/ → dist/
npm test                  # vitest unit tests (auto-skips live API calls without creds)
```

### Code style

- TypeScript, `"strict": true`, `"noUncheckedIndexedAccess": true`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`). Scope optional, encouraged: `feat(cli): ...`,
  `feat(worker): ...`, etc.
- Branch names: `feat/<thing>`, `fix/<thing>`, `chore/<thing>`,
  `docs/<thing>`.
- Keep PRs focused. Prefer one logical change per PR even if the diff is
  small.

### Project layout

| Directory             | What it is                                          |
| --------------------- | --------------------------------------------------- |
| `src/`                | TypeScript source. Compiled to `dist/` for publish. |
| `src/commands/`       | One file per top-level command group.               |
| `tests/`              | vitest unit tests (no live API by default).         |
| `worker/`             | Cloudflare Worker that brokers OAuth. Separate npm subpackage. |
| `clusters/`           | ASCII cluster maps, one JSON per cluster. Contributor-friendly — see [`clusters/README.md`](clusters/README.md). |
| `dist/`               | Build output. Gitignored.                           |

### Adding your campus cluster map

If `japonette cluster` says "no cluster map yet for `<your-campus>`" —
that's an invitation. Contribute one JSON file describing your cluster
and the next install will have it.

See [`clusters/README.md`](clusters/README.md) for the full schema and
PR checklist. The TL;DR: draw the room with `[·]` for each seat,
provide a `hosts` array of the workstation host strings in reading
order, drop the file at `clusters/<campus-slug>/<cluster-name>.json`,
open a PR. Takes ~10 minutes for a one-cluster campus.

### If you're forking to run your own broker

The CLI ships with a baked-in `WORKER_URL`. To self-host:

1. Deploy the worker. See [`worker/README.md`](worker/README.md). Short
   version:

   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put FT_SECRET   # paste your 42 app secret
   # edit wrangler.toml: set FT_UID and FT_REDIRECT_URI
   npx wrangler deploy
   ```

2. Update `WORKER_URL` in `src/auth.ts` to your deployed URL.
3. `npm run build`.

You can also override at runtime without rebuilding:

```bash
JAPONETTE_WORKER_URL=https://your-broker.workers.dev japonette login
```

Useful for testing a staging broker.

## Acknowledgements

- [42 Network](https://42.fr) for the API.
- [`commander`](https://github.com/tj/commander.js),
  [`cli-table3`](https://github.com/cli-table/cli-table3),
  [`kleur`](https://github.com/lukeed/kleur) — the boring-but-good CLI
  trio.
- [Cloudflare Workers](https://workers.cloudflare.com/) — the OAuth
  broker would have been a much bigger lift on a VPS.

## License

[MIT](LICENSE). Copyright © 2026 Moulay Ali Sakurai El Idrissi.

You can use, copy, modify, merge, publish, distribute, sublicense, and
sell copies of this software, including for commercial use, with no
warranty. See the [`LICENSE`](LICENSE) file for the full text.
