# Command grammar — proposal (for review)

> Draft for discussion. Not wired into the build or the published docs.
> Nothing here ships until we agree on it. Once locked, the relevant
> bits move into `ROADMAP.md` / `README.md` and this file can go.

## Why

The surface grew command-by-command, so the grammar drifted:

- `friends online` (noun→verb) sits next to a bare `active` — same idea
  ("who's logged in"), two different shapes.
- `--campus` is copy-pasted across `active`, `cluster`, and
  `friends online`.
- Frequency and prominence are mismatched: the command people run daily
  (`active`) is a top-level one-off, while a bare noun (`campus`) is
  spent on something you do once — set your campus.

The rest of the roadmap already assumes noun-first (`review open`,
`team find`, `project status`, `coalition top`), so today's commands are
the outliers. The fix is to make them match the convention the future
ones already use.

## Proposed grammar

1. **Noun first.** Anything you manage or inspect is a group: `campus`,
   `friends`, `cluster`, `user`, and the planned `review`, `team`,
   `project`. Verbs hang off the noun (`campus set`, `friends add`).
2. **The daily action is the bare noun; the verb is its alias.**
   Checking who's online is what people do every day; setting a campus is
   a once-and-forget. So the frequent action is the *default* action of a
   presence-bearing noun: bare `campus` shows who's at your campus right
   now. `campus online` stays as an explicit alias (the sanctioned
   `docker build` ≡ `docker image build` implicit-default pattern; cf.
   `git stash` ≡ `git stash push`). Rarer management actions are explicit
   verbs — `list`, `set`, `add`, `remove` — and each verb means the same
   thing across every noun. "Online" is a verb/default, never a `-o`
   flag (see research).
3. **Metric commands stay flat and take an optional `[login]` that
   defaults to you**: `logtime`, plus the planned `level`, `badges`,
   `stats`. They read as "show me X for someone", so they don't need a
   noun group.
4. **Session lifecycle stays flat**: `login`, `logout`, `uninstall`.
   `me` (formerly `whoami`) is "`user` pointed at yourself" and mirrors
   that command's output.
5. **Shared options, defined once.** `-c, --campus` resolves
   `--campus flag → $JAPONETTE_CAMPUS → saved default` on every command
   that targets a campus (`campus online`, `friends online`, `cluster`).
   Defined in one place, not copy-pasted per command. No `j` shorthand
   binary — brevity comes from short subcommand paths and conventional
   flags, per the research below.

## Target surface

```
login · logout · uninstall                session lifecycle
me [--info]                               you: presence + map, like `user <login>`

campus                 [-c -n]             who's at your campus now (default action)
campus online          [-c -n]             explicit alias of bare `campus`
campus list                                all campuses + their slugs (always live)
campus set                                 show your default campus
campus set <slug>                          set your default campus

friends                [-c]                which of your friends are online (default action)
friends online         [-c]                explicit alias of bare `friends`
friends list                               show your watchlist
friends add <login>
friends remove <login>

user <login> [--info]                      who they are + live location; map if online (--info adds profile)
cluster [-c]                                list the set campus's clusters, e.g. "Sakura (c5)"
cluster <name|code> [-c]                    that cluster's map + live occupancy
logtime [login] [-d -m]
```

`-c/--campus` is the same shared option everywhere it appears. Bare
`campus` / `friends` run the daily "who's online" action; managing the
campus default or the watchlist is an explicit verb.

## What actually changes today

Clean break, frequency-optimized:

| Old                       | New                          | Notes                                  |
| ------------------------- | ---------------------------- | -------------------------------------- |
| `active`                  | `campus` (≡ `campus online`) | the daily action gets the short path   |
| `campus` (showed default) | `campus set` (no arg)        | viewing the default is now under `set` |
| `friends online`          | `friends` (≡ `friends online`) | same frequency logic as campus       |
| `friends list`            | `friends list`               | unchanged, just no longer the default  |
| `campus list --refresh`   | `campus list`                | list is always live; cache self-heals  |
| `cluster --name c5`       | `cluster c5`                 | id is positional; matches code or name |
| `cluster --user/--me`     | `user <login>`               | person-on-map moved to `user`          |
| `whoami`                  | `me` (≡ `user` on yourself)  | self-card, same format as `user`       |

Rationale: nobody checks their default campus daily, but everybody
checks who's online — so the bare noun does the frequent thing and the
rare config view moves under `set`. Clean breaks, no aliases, all
changelog-noted: `active` is gone, and bare `campus` no longer shows your
default (that view moves to `campus set`). `-c/--campus` is resolved by
one shared helper.

> **Note on `campus set` as a getter.** Overloading `set` to *show* the
> value when given no argument is slightly unconventional (`set` usually
> means mutate). It has precedent (`git config user.name` shows,
> `… user.name X` sets; `npm config get/set`). Alternatives if the
> overload bothers you: `campus default` (show) + `campus set <slug>`,
> or `campus get` / `campus set`. Going with overloaded `set` per your
> call.

## Caching the campus directory (replaces `--refresh`)

The campus directory (~50 campuses, their slugs ↔ numeric IDs) is cached
locally because it's a hot internal lookup table — every campus-scoped
command (`campus`, `cluster`, `friends`) translates a slug to the ID the
API needs, so it's read on nearly every invocation, and the data is
near-static (new campuses appear a couple times a year).

Today that cache is invalidated by a manual `--refresh` flag, which only
works if the user knows the cache exists, notices it's stale, and
remembers the flag — the code even has to suggest it in error messages.
Replace it with self-managing freshness:

1. **Self-heal on miss.** Staleness only ever *matters* when a lookup
   fails — a slug that isn't in the cache, or a `campus_id` from
   `/v2/me` that doesn't resolve. On a miss, refetch the directory once
   and retry, *then* decide. New campuses (the only thing that causes a
   miss — renames keep the same ID) repair themselves transparently.

   ```
   resolveCampusId(slug):
     hit = findBySlug(cache, slug)
     if hit: return hit.id
     cache = fetchAllCampuses(); save(cache)   // self-heal, once
     return findBySlug(cache, slug)?.id ?? null
   ```

2. **`campus list` is always live.** Running `campus list` is the user
   explicitly asking for the current directory, so it fetches fresh every
   time and overwrites the cache as a side effect. No flag needed.

3. **Genuine miss → a real error.** If a slug still doesn't resolve
   *after* a fresh fetch, it truly doesn't exist (typo, or not a 42
   campus). Error accordingly, e.g.:

   > unknown campus `tokyoo` — not in the 42 campus directory (checked
   > live). Run `japonette campus list` to see valid slugs.

   Distinguish this from a network/API failure during the refetch, which
   should surface the API error, not "unknown campus."

`--refresh` is removed from the public surface (optionally kept as a
hidden manual override for debugging). Principle: **cache invalidation is
driven by access failure and explicit reads, never by asking the user to
do it.**

## Open question for the planned commands

`project status <login>` and `project <slug>` use the singular noun, but
`projects mine` uses the plural — same noun, two spellings. To stay on
rule 1, this would become `project mine`. Flagging rather than changing:
it's a future command, so it only matters when we build that group.

## The `user` lookup — presence first, profile on demand

Today `user <login>` prints one card: login, name, email, cursus level,
piscine level, location, `campus_id`, pool. The level/piscine/cursus/
`campus_id` rows are noise for the common case — when you look someone
up, you mostly want to know *are they here and where are they sitting*.

So the default becomes person-centric presence:

```
user alice
 login     alice
 name      Alice Liddell
 status    online — c1r4s2          (or: offline)

 [cluster map, alice's seat marked X]     ← only when she's online
```

- **Identity stays minimal**: login, name.
- **Status** reads the live `location` field — `online — <host>` or
  `offline`.
- **When online, the cluster map is drawn inline** with her seat marked,
  reusing the same map renderer `cluster` uses (only when her campus has
  a contributed map; otherwise just the `status` line). When offline, no
  map (later: a `lastseen` line could fill the gap).

`--info` *appends* the academic profile to the same card — it doesn't
switch screens, so it's a detail flag (`ls -l` idiom), not a mode toggle:

```
user alice --info
 …identity + status + map as above…
 email     alice@student.42.fr
 cursus    7.42 (42cursus)
 piscine   -
 campus    paris                    (slug, not the raw campus_id)
 pool      july 2023
```

Notes:
- `campus_id` becomes `campus` rendered as a **slug** via the directory
  cache — the CLI speaks slugs everywhere else; the raw ID was a leak.
- **Person-on-map lives here, not on `cluster`.** `user <login>` owns
  "one person, where are they"; `cluster` is dropping `--user`/`--me`
  (see the cluster section). Both render via the same map primitive, but
  the entry points no longer overlap: `user` = person-first, `cluster` =
  campus-wide.
- Email is out of the default card (it's not presence) and lives under
  `--info`.
- **`me` is this command pointed at yourself** (renamed from `whoami`):
  same presence-first card, same `--info`, no login argument needed. It
  also still proves your token works — any successful call does — so the
  old whoami token-check role is covered. (The raw `/v2/oauth/token/info`
  scope/expiry dump, if still wanted, could sit under `me --info`; drop
  it otherwise.)

## `cluster` — friendly index, JSON-only

`cluster` renders an ASCII floor map with live occupancy from a
**contributed JSON map** (`clusters/<campus>/<code>.json`). Maps stay the
single source of truth — **no grid is synthesized from host names**; a
campus with no map file simply has no cluster view yet (prompt to
contribute). Two things make the command pleasant instead of fiddly: a
friendly index and forgiving identifiers.

### Bare `cluster` lists what's available

Bare `cluster` lists the set campus's clusters as **`Name (code)`**, each
with a live status line — **occupied / total seats** and **how many of
your friends are there**:

```
cluster
 Sakura (c5)     34/56    2 friends
 Hanami (c1)     51/56    0 friends
 Komorebi (c2)    8/40    1 friend
cluster -c paris             … for a different campus
```

- **x/y** = occupied seats (live) / total seats (the JSON roster length).
- **friends** = watchlist members currently seated in that cluster
  (`1 friend` / `n friends`; dimmed or omitted when zero).

So a glance answers "which room has space" and "where are my people"
before you open anything. This replaces today's behavior (a bare-code
menu that only appears as a fallback on multi-cluster campuses) — it's
now the intentional entry point: scan the rooms, then open one.

Cost: bare `cluster` makes **one** live occupancy fetch for the campus,
then partitions those hosts across each cluster's roster locally — no
per-cluster API calls.

### Forgiving identifiers

`cluster <name|code>` opens a cluster's map, and the argument matches
**either the code or the friendly name, case-insensitively**:

```
cluster c5        ┐
cluster C5        ├─ all open the same cluster
cluster Sakura    ┘
cluster sakura    ┘
```

- **code** = the filename (`c5.json` → `c5`).
- **name** = a friendly display name in the JSON. (Today the `name` field
  holds a generic `"Cluster 5"`; this makes it a real name like
  `"Sakura"` that contributors set, and is what the index shows.)
- Resolution is case-insensitive on both; an unmatched id lists the
  available clusters (the same as bare `cluster`) so you can see valid
  ids.

### What the map still shows

Opening a cluster renders its seats with live occupancy and — because the
JSON carries the full seat roster — accurate **free seats**. Friends on
your watchlist can be highlighted distinctly from strangers. `--user` /
`--me` are **dropped** (one-person lookup is now `user <login>`), as is
`--no-occupancy`. `seat --near <login>` and the occupancy heatmap remain
the map-backed roadmap payoffs.

## Bare `japonette` launches the TUI

Planned: running `japonette` with no subcommand opens the full-screen
TUI, not a help dump. This makes the TUI the default home and the
subcommands the quick / scriptable escape hatch (the `lazygit` / `k9s`
model). The grammar above is unchanged — but a few consequences:

- **Help moves to an explicit command.** With no-args reserved for the
  TUI, discoverability lives at `japonette help` and `japonette -h`.
  The "grouped help" follow-up below becomes load-bearing, not cosmetic.
- **Resolvers must be command-independent.** The TUI reuses the same
  auth, API client, and campus resolution as the subcommands, so the
  shared `--campus → $JAPONETTE_CAMPUS → default` logic (and auth/client
  setup) needs to live in plain libs the TUI imports — not inside
  command action handlers. Worth keeping in mind when we centralize
  `--campus`: do it as a reusable resolver from the start.
- **Non-TTY falls back to help.** When stdout isn't an interactive
  terminal (`japonette | cat`, `japonette > out.txt`, scripts/CI), a TUI
  can't render. Bare invocation detects the non-TTY case and **prints the
  grouped help** instead of launching — so piping never hangs or dumps
  control codes, and the no-arg path still does something useful in a
  script.
- **`japonette tui` stays as an explicit command.** Bare `japonette`
  opens the TUI, and `japonette tui` is kept as an explicit, scriptable
  spelling — handy for docs, muscle memory, and `watch japonette tui`.
  (Unlike bare invocation, explicit `tui` on a non-TTY should *error*
  — the user asked for the TUI specifically — rather than silently
  printing help.)

## Research: how CLIs generally do this

Checked the two most-cited guides — [clig.dev](https://clig.dev/) and
[Microsoft's System.CommandLine design
guidance](https://learn.microsoft.com/en-us/dotnet/standard/commandline/design-guidance)
— plus the de-facto norms set by `git`, `docker`, `kubectl`, `gh`,
`gcloud`, and `aws`. The consensus:

- **Noun-verb subcommands are the dominant shape.** "Either `noun verb`
  or `verb noun` ordering works, but `noun verb` seems to be more
  common" (clig.dev) — `docker container create`, `gh pr list`,
  `gcloud compute instances list`. A few tools invert to verb-noun
  (`kubectl get pods`), but pick one and hold it.
- **A command with subcommands is an *area*, not an action.** "If a
  command has subcommands, the command should function as an area or a
  grouping identifier… rather than specify an action" (Microsoft).
  `campus` and `friends` are areas; actions hang off them as verbs.
- **Leaf commands are verbs; options are nouns.** "Use verbs rather than
  nouns for commands that refer to actions… and use nouns rather than
  verbs for options, for example `--configuration`, not `--configure`"
  (Microsoft). clig.dev: "Prefer flags to args," and keep options as
  parameters.
- **Options provide parameters, they don't pick the action.** "Options
  should provide parameters to commands, rather than specifying actions
  themselves" (Microsoft). A flag that switches the command into a
  different mode is the smell that says "this should be a subcommand."
- **Be consistent with verbs across nouns** (clig.dev) — `list` always
  means list, `set` always means set.
- **Minimize short-form aliases, and don't redefine conventional ones.**
  Microsoft reserves `-o` for `--output`, `-v` for `--verbosity`, `-i`
  for `--interactive`. clig.dev: avoid abbreviations that confuse.
- **Implicit-area shorthand is a sanctioned pattern.** `docker build`
  is shorthand for `docker image build`; both exist. If brevity matters,
  expose the short form *and* the full path rather than inventing a flag.

### Decision: `online` is a verb, not a flag

An earlier draft made "who's online" a `-o, --online` flag. The research
killed that idea on two counts:

1. It made an **option specify the action** (campus info → who's-here is
   a different command behavior, not a parameter) — guidance says that's
   a subcommand, not a flag.
2. **`-o` is conventionally `--output`**, so we'd be redefining a
   reserved alias.

So the grammar uses the verb-subcommand form — `campus online`,
`friends online` — matching `gh pr list`, `docker container ls`,
`kubectl get pods`. If we ever want brevity back, the sanctioned route
is the implicit-area shortcut (keep canonical `campus online`, optionally
also accept bare `active` like `docker build` ≡ `docker image build`),
not a flag. Not adopting that now — clean break, `active` is gone — but
it's the door to leave open.

## Follow-up tasks (not this pass)

- Shell completion (bash / zsh / fish).
- Discoverable help — `japonette help` shows the grouped surface above
  instead of a flat command dump. **Now the primary discovery path**,
  since bare `japonette` opens the TUI.

(No `j` shorthand binary — brevity comes from short subcommand paths and
conventional flags like `-c`, per grammar rule 5.)
