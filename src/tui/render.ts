// Content helpers for the dashboard: take the pooled data + UI state and return
// the text the blessed widgets display. The People body is a clickable list, so
// it returns row strings plus the backing people (index-aligned) for popups.
import kleur from "kleur";

import {
  blackholeDays,
  clusterRoster,
  computeStreak,
  durationToSeconds,
  fmtHM,
  liveSessionSeconds,
  mainCursus,
  type Loc,
  monthToDateSeconds,
  type RosterEntry,
  soonScaleTeams,
  weeklyTotals,
  ymd,
} from "./format.js";
import type { DashboardData } from "./store.js";

export type PeopleTab = "clusters" | "friends" | "active";

export interface UIState {
  tab: PeopleTab;
  clusterIdx: number;
  locked: boolean;
}

function personLine(r: RosterEntry): string {
  // ASCII-only glyphs: emoji/wide symbols render double-width in most terminals
  // but count as one cell, which shifts every following column.
  const mark = r.isFriend ? kleur.magenta("*") : " ";
  const name = (r.isFriend ? kleur.magenta : kleur.cyan)(r.login.padEnd(14));
  return ` ${mark} ${name} ${kleur.dim(r.host.padEnd(10))} ${kleur.dim(fmtHM(r.sinceSeconds).padStart(7))}`;
}

function locToRoster(l: Loc, friends: Set<string>, now: number): RosterEntry | null {
  const login = l.user?.login;
  if (!login) return null;
  const since = l.begin_at ? new Date(l.begin_at).getTime() : NaN;
  return {
    login,
    host: l.host ?? "-",
    sinceSeconds: Number.isNaN(since) ? 0 : Math.max(0, Math.floor((now - since) / 1000)),
    isFriend: friends.has(login),
  };
}

export function clusterCount(data: DashboardData): number {
  return data.clusters.length;
}

export function clusterIndex(data: DashboardData, ui: UIState): number {
  return Math.min(Math.max(ui.clusterIdx, 0), Math.max(0, data.clusters.length - 1));
}

export function clusterIsEmpty(data: DashboardData, idx: number): boolean {
  const c = data.clusters[idx];
  if (!c) return true;
  return clusterRoster(c.file.hosts, data.byHost, data.friends).length === 0;
}

export interface PeopleView {
  subhead: string; // one-line context (cluster name/pager, or count)
  items: string[]; // list rows
  people: RosterEntry[]; // index-aligned backing entries (for click → popup)
}

export function peopleView(data: DashboardData, ui: UIState): PeopleView {
  const now = Date.now();

  if (ui.tab === "clusters") {
    if (data.clusters.length === 0) {
      return { subhead: kleur.dim("no cluster maps for this campus"), items: [], people: [] };
    }
    const idx = clusterIndex(data, ui);
    const cur = data.clusters[idx]!;
    const roster = clusterRoster(cur.file.hosts, data.byHost, data.friends, new Date(now));
    const fr = roster.filter((r) => r.isFriend).length;
    const subhead =
      `${kleur.bold(cur.file.name)} ` +
      kleur.dim(
        `${idx + 1}/${data.clusters.length} · ${roster.length}/${cur.file.hosts.length}${fr ? ` · ${fr} fr` : ""}`,
      );
    return {
      subhead,
      items: roster.length ? roster.map(personLine) : [kleur.dim("  nobody here")],
      people: roster,
    };
  }

  if (ui.tab === "friends") {
    const online = new Set(data.active.map((l) => l.user?.login).filter((x): x is string => !!x));
    const friendLocs = data.active.filter((l) => l.user?.login && data.friends.has(l.user.login));
    const people = friendLocs
      .map((l) => locToRoster(l, data.friends, now))
      .filter((r): r is RosterEntry => r !== null);
    const offline = [...data.friends].filter((f) => !online.has(f)).sort();
    const items = people.length ? people.map(personLine) : [kleur.dim("  no friends online")];
    if (offline.length) items.push(kleur.dim(`  offline: ${offline.join(", ")}`));
    return { subhead: kleur.dim(`${people.length} online`), items, people };
  }

  // active
  const people = data.active
    .map((l) => locToRoster(l, data.friends, now))
    .filter((r): r is RosterEntry => r !== null);
  return {
    subhead: kleur.dim(`${people.length} online @ ${data.campus.slug}`),
    items: people.length ? people.map(personLine) : [kleur.dim("  nobody active")],
    people,
  };
}

export function youContent(data: DashboardData): string {
  const me = data.me;
  const mc = mainCursus(me);
  const bh = blackholeDays(mc?.blackholed_at);
  // The daily map misses the ongoing session — top it up from the live list
  // so logtime/streak don't sit at 0 while you're at a desk. "wk" is the
  // calendar week (since Monday), matching the intra, not a rolling 7 days.
  const live = liveSessionSeconds(data.active, me?.login);
  const streak = computeStreak(data.locationsStats, new Date(), live);
  const wk = (weeklyTotals(data.locationsStats, 1).pop()?.secs ?? 0) + live;
  const lvl = typeof mc?.level === "number" ? mc.level.toFixed(2) : "-";

  const bhText =
    bh === null
      ? kleur.dim("—")
      : bh <= 7
        ? kleur.red().bold(`${bh} days`)
        : bh <= 21
          ? kleur.yellow(`${bh} days`)
          : kleur.green(`${bh} days`);

  const label = (s: string) => kleur.cyan(s.padEnd(10));
  return [
    `${label("blackhole")} ${bhText}`,
    `${label("streak")} ${streak === 0 ? kleur.dim("0 days") : kleur.bold(`${streak} days`)}`,
    kleur.dim("──────────────"),
    `${label("level")} ${lvl}`,
    `${label("logtime")} ${kleur.dim("wk")} ${fmtHM(wk)}`,
    `${label("eval pts")} ${me?.correction_point ?? "-"}   ${kleur.cyan("wallet")} ${me?.wallet ?? "-"}`,
  ].join("\n");
}

export function upcomingContent(data: DashboardData): string {
  const items = soonScaleTeams(data.scaleTeams);
  if (items.length === 0) return kleur.dim("  nothing soon");
  return items
    .map((it) => {
      const when = new Date(it.at).toLocaleString("sv-SE", { hour12: false }).slice(5, 16);
      return ` ${kleur.dim("·")} ${kleur.dim(when)}  ${it.kind} ${it.label}`;
    })
    .join("\n");
}

export function headerContent(
  data: DashboardData,
  secsToRefresh: number,
  onlineKnown = true,
): string {
  const clock = new Date().toLocaleTimeString("sv-SE", { hour12: false }).slice(0, 5);
  const online = onlineKnown ? `${data.active.length}` : "…";
  return (
    `${kleur.bold("japonette")}  ${kleur.cyan(data.campus.slug)} · ${data.me?.login ?? "?"}` +
    `   ${kleur.dim(`${online} online · ${clock} · ↻${secsToRefresh}s`)}`
  );
}

export function statusContent(ui: UIState): string {
  return kleur.dim(
    [
      `${kleur.cyan("click")} tabs/names`,
      `${kleur.cyan("tab")} switch`,
      `${kleur.cyan("[ ]")} cluster`,
      `${kleur.cyan("l")} ${ui.locked ? "unlock" : "lock"}`,
      `${kleur.cyan("r")} refresh`,
      `${kleur.cyan("q")} quit`,
    ].join("   "),
  );
}

// Logtime popup: the last 7 days as labeled rows (weekday, hours, bar), then a
// weekly comparison graph (last 6 calendar weeks, Mon–Sun), then calendar
// totals (this week / this month — what the intra means, not rolling windows).
// All from the already-fetched daily map, no extra API call. `liveSeconds` is
// the ongoing session (the daily map only has completed ones) — folded into
// today, the current week, and the totals.
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function logtimePopup(
  stats: Record<string, unknown>,
  liveSeconds = 0,
  now: Date = new Date(),
): string {
  const barW = 24;
  const bar = (secs: number, max: number) =>
    kleur.green("█".repeat(Math.round((secs / Math.max(max, 1)) * barW)));
  const hm = (secs: number) =>
    secs === 0 ? kleur.dim(fmtHM(0).padStart(7)) : fmtHM(secs).padStart(7);

  const days: { label: string; secs: number; isToday: boolean }[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < 7; i++) {
    days.push({
      label: `${WEEKDAYS[cursor.getDay()]} ${String(cursor.getDate()).padStart(2, "0")}`,
      secs: durationToSeconds(stats?.[ymd(cursor)]) + (i === 0 ? liveSeconds : 0),
      isToday: i === 0,
    });
    cursor.setDate(cursor.getDate() - 1);
  }
  const dmax = Math.max(...days.map((d) => d.secs));
  const dayRows = days.map((d) => {
    const label = d.isToday ? kleur.bold().cyan("today ") : kleur.cyan(d.label);
    const live = d.isToday && liveSeconds > 0 ? kleur.dim(" ● live") : "";
    return `  ${label}  ${hm(d.secs)}  ${bar(d.secs, dmax)}${live}`;
  });

  const weeks = weeklyTotals(stats, 6, now);
  weeks[weeks.length - 1]!.secs += liveSeconds; // current week includes the live session
  const wmax = Math.max(...weeks.map((w) => w.secs));
  const weekRows = weeks.map((w, i) => {
    const current = i === weeks.length - 1;
    const label = `${MONTHS[w.start.getMonth()]} ${String(w.start.getDate()).padStart(2, "0")}`;
    const mark = current ? kleur.dim(" ● this week") : "";
    return `  ${(current ? kleur.bold().cyan : kleur.cyan)(label)}  ${hm(w.secs)}  ${bar(w.secs, wmax)}${mark}`;
  });

  const thisWeek = weeks[weeks.length - 1]!.secs;
  const thisMonth = monthToDateSeconds(stats, now) + liveSeconds;
  return [
    kleur.bold("logtime"),
    "",
    ...dayRows,
    "",
    kleur.bold("weeks") + kleur.dim("  mon–sun"),
    ...weekRows,
    "",
    `  ${kleur.cyan("this week")} ${fmtHM(thisWeek)}   ${kleur.cyan(MONTHS[now.getMonth()]!)} ${fmtHM(thisMonth)}`,
    "",
    kleur.dim("esc / click to close"),
  ].join("\n");
}

// Lines for the person popup: identity + their cluster seat map (if findable).
export function personPopup(
  entry: RosterEntry,
  findMap: (host: string) => string[] | null,
): string {
  const lines = [
    `${kleur.bold(entry.login)}${entry.isFriend ? kleur.magenta("  ♥ friend") : ""}`,
    `${kleur.cyan("host")}      ${entry.host}`,
    `${kleur.cyan("session")}   ${fmtHM(entry.sinceSeconds)}`,
  ];
  const map = findMap(entry.host);
  if (map) lines.push("", kleur.dim("their cluster:"), ...map);
  lines.push("", kleur.dim("esc / click to close"));
  return lines.join("\n");
}

// Search-result popup: the full academic card, plus session + seat map when
// they're online at the current campus — the same view as clicking a name in
// the roster, just with the richer card on top.
export function searchedUserPopup(
  u: any,
  loc: Loc | undefined,
  findMap: (host: string) => string[] | null,
  cardLines: string[],
  now: Date = new Date(),
): string {
  const lines = [...cardLines];
  const host = loc?.host ?? u?.location ?? null;
  if (loc?.begin_at) {
    const since = new Date(loc.begin_at).getTime();
    if (!Number.isNaN(since)) {
      const secs = Math.max(0, Math.floor((now.getTime() - since) / 1000));
      lines.push(`${kleur.cyan("session")}   ${fmtHM(secs)}`);
    }
  }
  const map = host ? findMap(host) : null;
  if (map) lines.push("", kleur.dim("their cluster:"), ...map);
  lines.push("", kleur.dim("esc / click to close"));
  return lines.join("\n");
}
