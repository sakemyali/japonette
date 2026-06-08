# japonette

[![npm version](https://img.shields.io/npm/v/japonette)](https://www.npmjs.com/package/japonette)
[![node](https://img.shields.io/node/v/japonette)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/japonette)](LICENSE)
[![downloads](https://img.shields.io/npm/dm/japonette)](https://www.npmjs.com/package/japonette)

> A tiny CLI for the [42 intra API](https://api.intra.42.fr). See who's at
> your campus right now, look up profiles, and keep a personal "friends"
> watchlist — all from your terminal.

![japonette demo](https://raw.githubusercontent.com/sakemyali/japonette/main/docs/demo.gif)

## Why

The intra web UI is great but slow. If you just want to know **who's
online right now** or **whether a friend is on campus** before walking
over, the terminal is faster. Everything is read-only — the CLI never
writes to 42's servers.

## Quick start

```bash
npm install -g japonette        # install (needs Node ≥ 18)
japonette login                 # browser-based 42 OAuth, ~10 seconds
japonette campus                # see who's at your campus right now
```

That's it — no API app to register, no config to write. The CLI uses a
hosted OAuth broker so login works out of the box.

Want to try without installing first?

```bash
npx japonette --help
```

### On a 42 cluster machine (no sudo)

42 cluster PCs are awkward for two reasons: `npm install -g` needs a
root-owned directory, and the system Node is locked to an old version
(e.g. 12.22.9) that japonette can't run on — it needs Node ≥ 18 for the
global `fetch`. One command handles both, no sudo:

```bash
curl -fsSL https://raw.githubusercontent.com/sakemyali/japonette/main/scripts/cluster-install.sh | bash
```

- If your Node is already ≥ 18, it just points npm's prefix at
  `~/.npm-global` and installs there.
- If it's too old (the usual cluster case), it bootstraps a modern Node
  LTS via [`nvm`](https://github.com/nvm-sh/nvm) — fully user-space — and
  installs under that.

Either way it's idempotent and safe to re-run. Open a new terminal
afterwards (or `source ~/.zshrc`) so the new `PATH` / nvm setup takes
effect, then `japonette login`. To inspect the script before running, see
[`scripts/cluster-install.sh`](scripts/cluster-install.sh).

## Commands

```bash
# Account
japonette login                       # browser-based 42 OAuth
japonette logout                      # delete local tokens
japonette me                          # your profile + live location (cluster map if online)
japonette me --info                   # also show cursus, piscine, campus, pool
japonette uninstall [-y]              # wipe all local state at ~/.config/42-cli/

# Profiles
japonette user <login>                # identity + live location; cluster map if they're online
japonette user <login> --info         # also show the academic profile

# Logtime
japonette logtime                     # your monthly logtime, last 4 months
japonette logtime alice               # someone else's logtime
japonette logtime --months 6          # widen the range
japonette logtime --days 14           # or scope it to recent days

# Campus — who's online, plus your default
japonette campus                      # who's at your campus right now
japonette campus -c paris             # any campus by slug
japonette campus -n 10                # limit rows
japonette campus list                 # all ~50 campuses with their slugs
japonette campus set                  # show your default campus
japonette campus set paris            # change your default

# Cluster maps (contributed per campus)
japonette cluster                     # index of the campus's clusters: occupancy + friends
japonette cluster c1                  # open one cluster's map, by code or friendly name

# Friends (local watchlist — the 42 API has no friends concept)
japonette friends                     # which friends are at the campus right now
japonette friends list                # show your watchlist
japonette friends add <login>
japonette friends remove <login>

# Shell
japonette help                        # grouped overview of all commands
japonette completion <shell>          # tab-completion for bash/zsh/fish (see below)
```

`japonette help` (or `japonette --help`) shows a grouped overview of the
commands by category; `japonette <command> --help` shows the flags for any
one command.

Commands that target a campus take `-c, --campus <slug>` and default to your
saved campus. Set `JAPONETTE_CAMPUS` to override the default for a whole shell
session without passing `-c` each time (precedence: `-c` flag → `$JAPONETTE_CAMPUS`
→ saved default).

## Shell completion

`japonette completion <shell>` prints a completion script for **bash**,
**zsh**, or **fish** (the shell is inferred from `$SHELL` if you omit it):

```bash
# zsh — quick, for the current session
eval "$(japonette completion zsh)"

# fish — persistent
japonette completion fish > ~/.config/fish/completions/japonette.fish

# bash — persistent
japonette completion bash > /etc/bash_completion.d/japonette
```

It completes the top-level commands and their subcommands (`campus list`,
`friends online`, …). The script is generated from the live command set,
so re-running it after an upgrade keeps completions current.

## Examples

**Daily "is anyone at the lab" check**:

```bash
japonette campus | head
```

**Build a small watchlist of people you team with**:

```bash
japonette friends add alice
japonette friends add bob
japonette friends     # check this any time you head to campus
```

**Find where a friend is sitting** (cluster map, if their campus has one):

```bash
japonette user norminette
```

**See how much someone's been on campus lately**:

```bash
japonette logtime alice --months 6   # per-month totals with a bar chart
```

**Switch campus temporarily** without changing your default:

```bash
japonette campus -c paris            # one-off
export JAPONETTE_CAMPUS=paris        # or for the whole session
```

## Updating & uninstalling

```bash
npm update -g japonette            # pull the latest version
japonette --version                 # what you're on
npm view japonette version          # what's published

japonette uninstall                 # wipe local state (~/.config/42-cli/)
npm uninstall -g japonette          # remove the binary
```

`japonette uninstall` prompts for confirmation. Pass `-y` to skip in
scripts. It removes saved config, tokens, the friends watchlist, and the
campus cache — but doesn't revoke the token server-side (use
`japonette logout` first if you want both).

## Editor integrations

- [Nmux42](https://github.com/Rouboufy/Nmux42) — a Neovim / Tmux / Zsh
  setup for 42 students; bundles `japonette` as a built-in Neovim TUI.

<details>
<summary><strong>Troubleshooting</strong></summary>

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

**`API error 401` / `429`.**
- `401` → token went stale unexpectedly; re-login.
- `429` → 42's rate limit (2 req/s, 1200/hour). The CLI paces itself but
  some loops still trip this. Wait a minute.

**Corporate / school proxy.**
The CLI uses Node's `fetch`, which honors `HTTPS_PROXY` if set in your
environment. If you can't reach `https://api.intra.42.fr` from your
terminal, the CLI can't either.

</details>

<details>
<summary><strong>What gets stored, and where</strong></summary>

`japonette` never sends anything to a third party other than (a) the 42
API itself and (b) the OAuth broker (only during login and token
refresh). Everything else lives on **your laptop** under
`~/.config/42-cli/`:

| File              | What's in it                                            | Permissions |
| ----------------- | ------------------------------------------------------- | ----------- |
| `config.json`     | Your default campus slug.                               | `0600`      |
| `token.json`      | OAuth access + refresh token, expiry.                   | `0600`      |
| `campuses.json`   | Cached `/v2/campus` payload so listings are instant.    | default     |
| `friends.json`    | Your local watchlist of logins.                         | default     |

`japonette logout` deletes `token.json`. Removing the whole directory is
also fine — the CLI will re-create it.

</details>

## More

- **[Contributing](CONTRIBUTING.md)** — dev setup, code style, opening a
  PR, project layout, adding a cluster map for your campus.
- **[Roadmap](ROADMAP.md)** — planned features. PRs welcome on any of
  them.
- **[Reference](docs/REFERENCE.md)** — how the OAuth broker works, rate
  limits, the `login` flow in detail.

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
