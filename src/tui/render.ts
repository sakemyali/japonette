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
  logtimeSeconds,
  mainCursus,
  type Loc,
  type RosterEntry,
  soonScaleTeams,
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
  const streak = computeStreak(data.locationsStats);
  const wk = logtimeSeconds(data.locationsStats, 7);
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

// Logtime popup: a per-day sparkline of the last 14 days + today/week/month
// totals, all from the already-fetched locations_stats (no extra API call).
const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
export function logtimePopup(stats: Record<string, unknown>, now: Date = new Date()): string {
  const days = 14;
  const secs: number[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < days; i++) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
      cursor.getDate(),
    ).padStart(2, "0")}`;
    secs.unshift(durationToSeconds(stats?.[ymd]));
    cursor.setDate(cursor.getDate() - 1);
  }
  const max = Math.max(...secs, 1);
  const spark = secs
    .map((s) => (s === 0 ? kleur.dim("▁") : SPARK[Math.min(SPARK.length - 1, Math.round((s / max) * (SPARK.length - 1)))]))
    .join("");
  return [
    kleur.bold("logtime — last 14 days"),
    "",
    `  ${spark}`,
    "",
    `${kleur.cyan("today")}   ${fmtHM(logtimeSeconds(stats, 1, now))}`,
    `${kleur.cyan("week")}    ${fmtHM(logtimeSeconds(stats, 7, now))}`,
    `${kleur.cyan("month")}   ${fmtHM(logtimeSeconds(stats, 30, now))}`,
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
