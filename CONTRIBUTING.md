# Contributing

Issues and PRs are welcome on <https://github.com/sakemyali/japonette>.

## Reporting bugs

Open an issue with:

- What you ran (`japonette <command> <args>`).
- What you expected.
- What happened (including any error message).
- `node --version` and your OS.

Don't include your token file, your UID/SECRET, or any output from
`japonette whoami` — those contain identifiers.

## Dev setup

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

## Code style

- TypeScript, `"strict": true`, `"noUncheckedIndexedAccess": true`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`). Scope optional, encouraged: `feat(cli): ...`,
  `feat(worker): ...`, etc.
- Branch names: `feat/<thing>`, `fix/<thing>`, `chore/<thing>`,
  `docs/<thing>`.
- Keep PRs focused. Prefer one logical change per PR even if the diff is
  small.

## Opening a pull request

Standard GitHub fork-and-PR flow:

1. **Fork** `sakemyali/japonette` on GitHub (top-right "Fork" button).
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/<your-username>/japonette
   cd japonette
   npm install
   ```

3. **Create a branch** off `main`, following the naming convention from
   [Code style](#code-style):

   ```bash
   git checkout -b feat/<thing>
   ```

4. **Make your changes** and commit using conventional commits.
5. **Push to your fork**:

   ```bash
   git push -u origin feat/<thing>
   ```

6. **Open a PR** against `sakemyali/japonette:main` — either via the URL
   GitHub prints after the push, or with `gh pr create` if you have the
   [GitHub CLI](https://cli.github.com/).
7. Address review comments by pushing more commits to the same branch —
   the PR updates automatically. Once approved, it'll be merged.

First time contributing to open source? GitHub's
[fork-a-repo guide](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
walks through the same flow with screenshots.

## Project layout

| Directory             | What it is                                          |
| --------------------- | --------------------------------------------------- |
| `src/`                | TypeScript source. Compiled to `dist/` for publish. |
| `src/commands/`       | One file per top-level command group.               |
| `tests/`              | vitest unit tests (no live API by default).         |
| `worker/`             | Cloudflare Worker that brokers OAuth. Separate npm subpackage. |
| `clusters/`           | ASCII cluster maps, one JSON per cluster. Contributor-friendly — see [`clusters/README.md`](clusters/README.md). |
| `docs/`               | Reference documentation and demo assets.            |
| `dist/`               | Build output. Gitignored.                           |

## Adding your campus cluster map

If `japonette cluster` says "no cluster map yet for `<your-campus>`" —
that's an invitation. Contribute one JSON file describing your cluster
and the next install will have it.

See [`clusters/README.md`](clusters/README.md) for the full schema and
PR checklist. The TL;DR: draw the room with `[·]` for each seat,
provide a `hosts` array of the workstation host strings in reading
order, drop the file at `clusters/<campus-slug>/<cluster-name>.json`,
open a PR. Takes ~10 minutes for a one-cluster campus.

## If you're forking to run your own broker

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
