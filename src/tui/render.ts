// Content renderers for each dashboard widget: take the pooled data + UI state
// and return the kleur-colored text for a blessed box (which clips to its own
// size, so no width math here). Kept separate from the blessed wiring.
import kleur from "kleur";

import {
  blackholeDays,
  clusterRoster,
  computeStreak,
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

function personLine(login: string, host: string, since: number, friend: boolean): string {
  const heart = friend ? kleur.magenta("♥") : " ";
  const name = (friend ? kleur.magenta : kleur.cyan)(login.padEnd(14));
  return ` ${heart} ${name} ${kleur.dim(host.padEnd(10))} ${kleur.dim(fmtHM(since).padStart(7))}`;
}

function rosterToLines(roster: RosterEntry[]): string[] {
  return roster.map((r) => personLine(r.login, r.host, r.sinceSeconds, r.isFriend));
}

function activeToLines(active: Loc[], friends: Set<string>, now = Date.now()): string[] {
  return active
    .map((l): RosterEntry | null => {
      const login = l.user?.login;
      if (!login) return null;
      const since = l.begin_at ? new Date(l.begin_at).getTime() : NaN;
      return {
        login,
        host: l.host ?? "-",
        sinceSeconds: Number.isNaN(since) ? 0 : Math.max(0, Math.floor((now - since) / 1000)),
        isFriend: friends.has(login),
      };
    })
    .filter((r): r is RosterEntry => r !== null)
    .map((r) => personLine(r.login, r.host, r.sinceSeconds, r.isFriend));
}

export function clusterCount(data: DashboardData): number {
  return data.clusters.length;
}

// Whether the cluster at `idx` has nobody seated (for skip-empty auto-rotate).
export function clusterIsEmpty(data: DashboardData, idx: number): boolean {
  const c = data.clusters[idx];
  if (!c) return true;
  return clusterRoster(c.file.hosts, data.byHost, data.friends).length === 0;
}

export function peopleContent(data: DashboardData, ui: UIState): string {
  const tabChip = (key: PeopleTab, label: string): string =>
    ui.tab === key ? kleur.black().bgCyan(` ${label} `) : kleur.dim(`  ${label}  `);
  const tabs = `${tabChip("clusters", "Clusters")}${tabChip("friends", "Friends")}${tabChip("active", "Active")}`;
  const lines: string[] = [tabs, ""];

  if (ui.tab === "clusters") {
    if (data.clusters.length === 0) {
      lines.push(kleur.dim("no cluster maps for this campus"));
      return lines.join("\n");
    }
    const idx = Math.min(Math.max(ui.clusterIdx, 0), data.clusters.length - 1);
    const cur = data.clusters[idx]!;
    const roster = clusterRoster(cur.file.hosts, data.byHost, data.friends);
    const lock = ui.locked ? kleur.yellow("🔒") : kleur.dim("🔓");
    const friendsHere = roster.filter((r) => r.isFriend).length;
    const occ = `${roster.length}/${cur.file.hosts.length}${friendsHere ? ` · ${friendsHere}♥` : ""}`;
    lines.push(
      `${kleur.dim("‹")} ${kleur.bold(cur.file.name)} ${kleur.dim(`· ${idx + 1}/${data.clusters.length} ›`)}  ${lock}  ${kleur.dim(occ)}`,
    );
    lines.push("");
    if (roster.length === 0) lines.push(kleur.dim("  nobody here"));
    else lines.push(...rosterToLines(roster));
    return lines.join("\n");
  }

  if (ui.tab === "friends") {
    const onlineLogins = new Set(
      data.active.map((l) => l.user?.login).filter((x): x is string => !!x),
    );
    const onlineFriends = data.active.filter(
      (l) => l.user?.login && data.friends.has(l.user.login),
    );
    if (onlineFriends.length === 0) lines.push(kleur.dim("  no friends online"));
    else lines.push(...activeToLines(onlineFriends, data.friends));
    const offline = [...data.friends].filter((f) => !onlineLogins.has(f)).sort();
    if (offline.length > 0) {
      lines.push("");
      lines.push(kleur.dim(`  offline: ${offline.join(", ")}`));
    }
    return lines.join("\n");
  }

  // active
  lines.push(kleur.dim(`  ${data.active.length} online @ ${data.campus.slug}`));
  lines.push(...activeToLines(data.active, data.friends));
  return lines.join("\n");
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

  return [
    `${kleur.cyan("☄ blackhole")}   ${bhText}`,
    `${kleur.cyan("🔥 streak")}      ${streak === 0 ? kleur.dim("0 days") : kleur.bold(`${streak} days`)}`,
    kleur.dim("──────────────"),
    `${kleur.cyan("lvl")}          ${lvl}`,
    `${kleur.cyan("⏱ logtime")}    ${kleur.dim("wk")} ${fmtHM(wk)}`,
    `${kleur.cyan("◷ eval pts")}   ${me?.correction_point ?? "-"}   ${kleur.cyan("₳")} ${me?.wallet ?? "-"}`,
  ].join("\n");
}

export function upcomingContent(data: DashboardData): string {
  const items = soonScaleTeams(data.scaleTeams);
  if (items.length === 0) return kleur.dim("  nothing soon");
  return items
    .map((it) => {
      const when = new Date(it.at).toLocaleString("sv-SE", { hour12: false }).slice(5, 16);
      return ` ${kleur.dim("🔕")} ${kleur.dim(when)}  ${it.kind} ${it.label}`;
    })
    .join("\n");
}

export function menuContent(): string {
  const item = (key: string, label: string) => `${kleur.cyan(key)} ${label}`;
  return [
    `${item("s", "search")}   ${item("m", "maps")}   ${item("t", "logtime")}`,
    `${item("c", "campus")}   ${item("u", "me")}     ${item("?", "help")}`,
    kleur.dim("(launchers — coming online next)"),
  ].join("\n");
}

export function headerContent(data: DashboardData, secsToRefresh: number): string {
  const clock = new Date().toLocaleTimeString("sv-SE", { hour12: false }).slice(0, 5);
  return (
    `${kleur.bold("japonette")}  ${kleur.cyan(data.campus.slug)} · ${data.me?.login ?? "?"}` +
    `   ${kleur.dim(`${data.active.length} online · ${clock} · ↻${secsToRefresh}s`)}`
  );
}

export function statusContent(ui: UIState): string {
  const keys = [
    `${kleur.cyan("tab")} switch`,
    `${kleur.cyan("‹ ›/h l")} cluster`,
    `${kleur.cyan("L")} ${ui.locked ? "unlock" : "lock"}`,
    `${kleur.cyan("r")} refresh`,
    `${kleur.cyan("q")} quit`,
  ];
  return kleur.dim(keys.join("   "));
}
