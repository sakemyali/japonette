import { AuthError } from "../auth.js";
import { ApiError, apiGet, paginate } from "../client.js";
import { err, logtimeTable, withSpinner } from "../render.js";
import {
  bucketDailySeconds,
  startOfWeek,
  weeklyTotals,
  ymd as ymdLocal,
} from "../tui/format.js";

interface LogtimeOpts {
  days?: string;
  weeks?: string;
  months?: string;
}

const DEFAULT_MONTHS = 4;

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonthsUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

function addDaysUTC(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export interface MonthBucket {
  ym: string;
  seconds: number;
}

interface Location {
  begin_at?: string | null;
  end_at?: string | null;
}

// Attribute each session to the YYYY-MM of its begin_at (UTC). Sessions that
// straddle a month boundary are counted in their starting month — small skew,
// matches how intra's own profile graph behaves.
export function bucketSessionsByMonth(
  locations: Location[],
  from: Date,
  to: Date,
): MonthBucket[] {
  const buckets = new Map<string, number>();
  let cursor = startOfMonthUTC(from);
  const last = startOfMonthUTC(to);
  while (cursor.getTime() <= last.getTime()) {
    buckets.set(ymd(cursor).slice(0, 7), 0);
    cursor = addMonthsUTC(cursor, 1);
  }
  const nowMs = Date.now();
  const fromMs = from.getTime();
  const toEndMs = addDaysUTC(to, 1).getTime();
  for (const loc of locations) {
    if (!loc.begin_at) continue;
    const begin = new Date(loc.begin_at).getTime();
    if (Number.isNaN(begin)) continue;
    if (begin >= toEndMs) continue;
    const endRaw = loc.end_at ? new Date(loc.end_at).getTime() : nowMs;
    const end = Number.isNaN(endRaw) ? nowMs : endRaw;
    // Clip to range so a session that started before `from` only counts its
    // tail inside the window.
    const lo = Math.max(begin, fromMs);
    const hi = Math.min(end, toEndMs);
    if (hi <= lo) continue;
    const ym = ymd(new Date(begin)).slice(0, 7);
    if (!buckets.has(ym)) continue;
    buckets.set(ym, (buckets.get(ym) ?? 0) + Math.floor((hi - lo) / 1000));
  }
  return [...buckets.entries()].map(([ym, seconds]) => ({ ym, seconds }));
}

function parseCount(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error(`${flag} must be a positive integer, got: ${value}`);
  }
  return n;
}

async function resolveUser(
  arg: string | undefined,
): Promise<{ login: string; id: number }> {
  if (!arg) {
    const me = await apiGet<{ login?: string; id?: number }>("/v2/me");
    if (!me.login || !me.id) throw new Error("could not resolve your account from /v2/me");
    return { login: me.login, id: me.id };
  }
  const login = arg.trim().toLowerCase();
  const u = await apiGet<{ login?: string; id?: number }>(
    `/v2/users/${encodeURIComponent(login)}`,
  );
  if (!u.id) throw new Error(`could not resolve id for ${login}`);
  return { login: u.login ?? login, id: u.id };
}

// Exported for the TUI: /v2/users/:id/locations_stats 403s for plain tokens,
// so the dashboard rebuilds its daily map from these raw sessions instead.
export async function fetchLocationsSince(
  userId: number,
  from: Date,
): Promise<Location[]> {
  const fromMs = from.getTime();
  const out: Location[] = [];
  // Sorted newest-first; bail out as soon as we cross the `from` boundary.
  for await (const loc of paginate<Location>(
    `/v2/users/${userId}/locations`,
    { sort: "-begin_at" },
    100,
  )) {
    if (loc?.begin_at) {
      const begin = new Date(loc.begin_at).getTime();
      if (!Number.isNaN(begin) && begin < fromMs) break;
    }
    out.push(loc);
  }
  return out;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Daily / weekly tables, bucketed in *local* time (what a human means by "a
// day at the campus"), unlike the monthly view which keeps its UTC buckets.
// Ongoing sessions count up to now, like the monthly view.
async function dayWeekTable(
  user: { login: string; id: number },
  mode: "day" | "week",
  n: number,
): Promise<void> {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = startOfWeek(midnight);
  const from =
    mode === "day"
      ? new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() - (n - 1))
      : new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - (n - 1) * 7);
  const label = `last ${n} ${mode}${n === 1 ? "" : "s"}`;
  const locations = await withSpinner(`fetching logtime for ${user.login} (${label})...`, () =>
    fetchLocationsSince(user.id, from),
  );
  const stats = bucketDailySeconds(locations, now);

  let rows: { label: string; seconds: number }[];
  if (mode === "day") {
    rows = [];
    const cursor = new Date(from);
    while (cursor.getTime() <= midnight.getTime()) {
      rows.push({
        label: `${ymdLocal(cursor)} ${WEEKDAYS[cursor.getDay()]}`,
        seconds: stats[ymdLocal(cursor)] ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    rows = weeklyTotals(stats, n, now).map((w) => ({
      label: `wk ${ymdLocal(w.start)}`,
      seconds: w.secs,
    }));
  }
  const totalDays = Math.round((midnight.getTime() - from.getTime()) / 86400000) + 1;
  logtimeTable(rows, `Logtime — ${user.login} (${label})`, totalDays, mode);
}

export async function logtimeCmd(
  login: string | undefined,
  opts: LogtimeOpts,
): Promise<void> {
  try {
    const days = parseCount(opts.days, "--days");
    const weeks = parseCount(opts.weeks, "--weeks");
    const months = parseCount(opts.months, "--months");
    if ([days, weeks, months].filter((x) => x !== undefined).length > 1) {
      throw new Error("pass only one of --days, --weeks, --months");
    }
    const user = await resolveUser(login);

    if (days !== undefined) return await dayWeekTable(user, "day", days);
    if (weeks !== undefined) return await dayWeekTable(user, "week", weeks);

    const m = months ?? DEFAULT_MONTHS;
    const label = `last ${m} month${m === 1 ? "" : "s"}`;
    const today = new Date();
    const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const from = addMonthsUTC(to, -m);
    const locations = await withSpinner(
      `fetching logtime for ${user.login} (${label})...`,
      () => fetchLocationsSince(user.id, from),
    );
    const buckets = bucketSessionsByMonth(locations, from, to).map((b) => ({
      label: b.ym,
      seconds: b.seconds,
    }));
    const totalDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    logtimeTable(buckets, `Logtime — ${user.login} (${label})`, totalDays);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      err(`user not found: ${login ?? "(self)"}`);
      process.exit(1);
    }
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    if (e instanceof Error) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
}
