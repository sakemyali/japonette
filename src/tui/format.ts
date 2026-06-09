// Pure data-shaping for the TUI dashboard. No blessed, no I/O — unit-tested
// directly so the interactive layer stays a thin shell over tested logic.

export interface Loc {
  host?: string;
  user?: { login?: string };
  begin_at?: string;
}

// Days remaining until blackhole (ceil), or null if not on a blackhole cursus.
export function blackholeDays(
  blackholedAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!blackholedAt) return null;
  const t = new Date(blackholedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / 86_400_000);
}

// Parse a locations_stats value ("HH:MM:SS.fff" duration, or seconds) to seconds.
export function durationToSeconds(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const m = v.match(/^(\d+):(\d{2}):(\d{2})/);
  if (!m) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Consecutive-day logtime streak from locations_stats ({ "YYYY-MM-DD": dur }).
// Counts back from today; if today isn't logged yet, the streak still stands
// from yesterday (so it isn't "broken" before end of day).
export function computeStreak(
  stats: Record<string, unknown>,
  now: Date = new Date(),
): number {
  const logged = new Set<string>();
  for (const [day, v] of Object.entries(stats ?? {})) {
    if (durationToSeconds(v) > 0) logged.add(day);
  }
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!logged.has(ymd(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (logged.has(ymd(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Total logtime (seconds) over the last `days` days, inclusive of today.
export function logtimeSeconds(
  stats: Record<string, unknown>,
  days: number,
  now: Date = new Date(),
): number {
  let total = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < days; i++) {
    total += durationToSeconds((stats ?? {})[ymd(cursor)]);
    cursor.setDate(cursor.getDate() - 1);
  }
  return total;
}

export interface RosterEntry {
  login: string;
  host: string;
  sinceSeconds: number;
  isFriend: boolean;
}

// People seated in a cluster (hosts that map to an active location), friends
// first then longest session.
export function clusterRoster(
  hosts: string[],
  byHost: Map<string, Loc>,
  friends: Set<string>,
  now: Date = new Date(),
): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const h of hosts) {
    const loc = byHost.get(h);
    const login = loc?.user?.login;
    if (!loc || !login) continue;
    const since = loc.begin_at ? new Date(loc.begin_at).getTime() : NaN;
    out.push({
      login,
      host: h,
      sinceSeconds: Number.isNaN(since)
        ? 0
        : Math.max(0, Math.floor((now.getTime() - since) / 1000)),
      isFriend: friends.has(login),
    });
  }
  out.sort(
    (a, b) => Number(b.isFriend) - Number(a.isFriend) || b.sinceSeconds - a.sinceSeconds,
  );
  return out;
}

// Step a carousel index, optionally skipping entries `isEmpty` flags. Wraps
// around; if every entry is empty, falls back to the plain step.
export function stepCarousel(
  current: number,
  len: number,
  dir: 1 | -1,
  isEmpty?: (i: number) => boolean,
): number {
  if (len <= 0) return 0;
  const wrap = (i: number) => ((i % len) + len) % len;
  let i = wrap(current + dir);
  if (!isEmpty) return i;
  for (let n = 0; n < len; n++) {
    if (!isEmpty(i)) return i;
    i = wrap(i + dir);
  }
  return wrap(current + dir);
}

export interface SoonItem {
  at: string;
  kind: string;
  label: string;
}

// Upcoming evaluations within `windowHours`, soonest first, capped. Keeps an
// item until ~1h after it starts (so an in-progress eval doesn't vanish).
export function soonScaleTeams(
  teams: any[],
  now: Date = new Date(),
  windowHours = 24,
  cap = 5,
): SoonItem[] {
  const horizon = now.getTime() + windowHours * 3_600_000;
  return (teams ?? [])
    .filter((t) => {
      if (!t?.begin_at) return false;
      const ts = new Date(t.begin_at).getTime();
      return ts + 3_600_000 > now.getTime() && ts <= horizon;
    })
    .sort((a, b) => String(a.begin_at).localeCompare(String(b.begin_at)))
    .slice(0, cap)
    .map((t) => ({
      at: String(t.begin_at),
      kind: "eval",
      label:
        t.team?.name ||
        (t.correcteds ?? [])
          .map((c: any) => c?.login)
          .filter(Boolean)
          .join(", ") ||
        "review",
    }));
}

// Main cursus_user (42cursus, else a non-piscine cursus, else the last one).
export function mainCursus(me: any): any | undefined {
  const cs: any[] = me?.cursus_users ?? [];
  return (
    cs.find((c) => String(c?.cursus?.slug ?? "").toLowerCase() === "42cursus") ??
    cs.find((c) => {
      const s = String(c?.cursus?.slug ?? "").toLowerCase();
      return s.includes("cursus") && !s.includes("piscine");
    }) ??
    cs[cs.length - 1]
  );
}

export function fmtHM(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}m`;
}
