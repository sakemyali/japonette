# Roadmap

Ideas for what comes next. PRs welcome on any of these — open an issue
first if it's a larger one so we can align on shape.

## Recently shipped

- [x] `japonette logtime [<login>]` — per-month logtime totals with a bar
  chart; defaults to the last 4 months, scoped with `--days` / `--months`
  *(0.2.0)*.
- [x] One-line install for 42 cluster machines without sudo —
  [`scripts/cluster-install.sh`](scripts/cluster-install.sh) *(0.2.0)*.

## Command ergonomics *(priority)*

The current command surface is verbose and scattered — verbs aren't
consistent (`friends online` vs. `active`), `--campus` is repeated
across half the commands, and there are no short forms. The goal is a
logical noun/verb grouping that's shorter to type and easier to
remember.

- [ ] Reorganize commands into a consistent noun/verb system so related
  actions live under the same group.
- [ ] Shorter command aliases (`j a` → `active`, `j f o` → `friends online`).
- [ ] Shell completion (bash / zsh / fish).
- [ ] Reduce flag repetition — centralize `--campus` via a shared
  option or a `JAPONETTE_CAMPUS` env var.
- [ ] Discoverable help — `japonette help` shows a grouped overview
  instead of a flat command dump.

## Peer evaluations & group projects *(42-specific)*

- [ ] `japonette review open` — publish a review slot for one of your
  projects.
- [ ] `japonette review book <project>` — browse open slots on a specific
  project and book one.
- [ ] `japonette review list` — see your upcoming reviews (both directions).
- [ ] `japonette team find <project>` — for group projects (`minishell`,
  `philosophers`, …) show people at your campus still looking for a
  teammate.
- [ ] `japonette team status` — your current project teams and their members.

## Projects & curriculum progress

- [ ] `japonette project status <login>` — what alice is currently
  working on (project + start date + team).
- [ ] `japonette projects mine` — your in-progress and completed projects
  with marks.
- [ ] `japonette project <slug>` — project info + who at your campus has
  it in-progress.
- [ ] `japonette level [<login>]` — cursus level + XP bar to next;
  defaults to self.
- [ ] `japonette blackhole` — days remaining (for users still on the old
  cursus).
- [ ] `japonette friends levels` — leaderboard of your watchlist by level.
- [ ] `japonette coalition` — your coalition + score + rank.
- [ ] `japonette coalition top` — campus coalition leaderboard.

## Schedule & reminders

- [ ] `japonette exams` — upcoming exams at your campus with date,
  duration, and project list.
- [ ] `japonette events` — campus events (hackathons, talks, deadlines)
  with `--upcoming` filter.
- [ ] `japonette today` — daily digest: friends online now, your upcoming
  reviews, open exams, new events.
- [ ] `japonette agenda` — combined chronological view of every
  review / exam / event you're signed up for.
- [ ] `japonette remind` — set local reminders (native OS notification)
  ahead of any review, exam, or event.

## More user info

- [ ] `japonette badges <login>` — someone's unlocked badges.
- [ ] `japonette badges --diff <login>` — what you have that they don't,
  and vice versa.
- [ ] `japonette lastseen <login>` — when alice was last at a
  workstation, plus their previous host.
- [ ] `japonette stats <login>` — one-shot comprehensive dump (level,
  coalition, projects done, peer-review points, top badges).
- [ ] `japonette search <query>` — fuzzy search users by login or display
  name.
- [ ] `japonette notifs` — pull `/v2/me/notifications` so you don't need
  to open intra.

## Internationalization

- [ ] Localize CLI output by campus (Japanese for `tokyo`, French for
  `paris`, Korean for `seoul`, etc. — auto-detected from your default
  campus, overridable with `--lang`).
- [ ] Translate command help text.

## Interactive mode

- [ ] `japonette tui` — full-screen interactive UI (cluster view,
  friends list, active users) with keyboard navigation.
- [ ] Live-refresh mode for `active` and `friends online`.

## Other

- [ ] Notify when a friend logs in (background watcher, native OS
  notification).
- [ ] `japonette seat --near <login>` — find an empty seat next to
  someone.
- [ ] Cluster heatmap / occupancy stats over time.
- [ ] Better post-login browser landing page — currently bare "You can
  close this tab"; show the logged-in user (login, avatar, campus) and
  a short starter cheatsheet so the first impression isn't a blank
  white page.
- [ ] More campus cluster maps — ongoing, see
  [`clusters/README.md`](clusters/README.md).
