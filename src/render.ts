import Table from "cli-table3";
import kleur from "kleur";

const TABLE_CHARS = {
  top: "─",
  "top-mid": "┬",
  "top-left": "┌",
  "top-right": "┐",
  bottom: "─",
  "bottom-mid": "┴",
  "bottom-left": "└",
  "bottom-right": "┘",
  left: "│",
  "left-mid": "├",
  mid: "─",
  "mid-mid": "┼",
  right: "│",
  "right-mid": "┤",
  middle: "│",
};

function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtTime(s: string | null | undefined): string {
  const d = parseIso(s);
  if (!d) return "-";
  return d.toLocaleString("sv-SE", { hour12: false }).slice(0, 16);
}

export function fmtDuration(begin: string | null | undefined): string {
  const d = parseIso(begin);
  if (!d) return "-";
  const total = Math.floor((Date.now() - d.getTime()) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}m`;
}

export function err(msg: string): void {
  process.stderr.write(kleur.red(msg) + "\n");
}

export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  const frames = ["◐", "◓", "◑", "◒"];
  const isTTY = process.stderr.isTTY;
  let i = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  if (isTTY) {
    process.stderr.write(`${frames[0]} ${text}`);
    interval = setInterval(() => {
      i = (i + 1) % frames.length;
      process.stderr.write(`\r${frames[i]} ${text}`);
    }, 80);
  }
  try {
    return await fn();
  } finally {
    if (interval) clearInterval(interval);
    if (isTTY) {
      process.stderr.write(`\r${" ".repeat(text.length + 2)}\r`);
    }
  }
}

// Primary campus (id + human slug) from the user payload's embedded `campus`
// list. The slug matches the rest of the CLI, which speaks slugs; the id lets
// callers fetch that campus's occupancy.
export function primaryCampus(u: any): { id: number; slug: string } | null {
  const cu = (u.campus_users ?? []).find((c: any) => c.is_primary) ?? (u.campus_users ?? [])[0];
  const campus = cu
    ? (u.campus ?? []).find((c: any) => Number(c.id) === Number(cu.campus_id))
    : undefined;
  if (!campus?.name) return null;
  return {
    id: Number(campus.id),
    slug: String(campus.name).toLowerCase().replace(/\s+/g, "-"),
  };
}

// Presence-first user card: identity + live status by default. `info` appends
// the academic profile (the `ls -l` idiom — more detail, same card).
export function userCard(u: any, opts: { info?: boolean } = {}): void {
  const status = u.location
    ? kleur.green("online") + kleur.dim(" — ") + u.location
    : kleur.dim("offline");

  const t = new Table({ chars: TABLE_CHARS, style: { head: [], border: [] } });
  t.push(
    [kleur.cyan("login"), u.login ?? "-"],
    [kleur.cyan("name"), u.displayname ?? u.usual_full_name ?? "-"],
    [kleur.cyan("status"), status],
  );

  if (opts.info) {
    const cursusUsers: any[] = u.cursus_users ?? [];
    const findCursus = (predicate: (slug: string) => boolean) =>
      cursusUsers.find((cu) => predicate(String(cu?.cursus?.slug ?? "").toLowerCase()));
    const main =
      findCursus((s) => s === "42cursus") ??
      findCursus((s) => s.includes("cursus") && !s.includes("piscine"));
    const piscine = findCursus((s) => s.includes("piscine"));
    const fmtLevel = (cu: any | undefined): string =>
      cu && typeof cu.level === "number"
        ? `${cu.level.toFixed(2)} (${cu.cursus?.slug ?? "?"})`
        : "-";

    t.push(
      [kleur.cyan("email"), u.email ?? "-"],
      [kleur.cyan("cursus"), fmtLevel(main)],
      [kleur.cyan("piscine"), fmtLevel(piscine)],
      [kleur.cyan("campus"), primaryCampus(u)?.slug ?? "-"],
      [kleur.cyan("pool"), `${u.pool_month ?? "-"} ${u.pool_year ?? "-"}`],
    );
  }
  console.log(t.toString());
}

export function campusCard(c: any, slug: string, isDefault: boolean): void {
  const t = new Table({ chars: TABLE_CHARS, style: { head: [], border: [] } });
  t.push(
    [kleur.cyan("slug"), slug + (isDefault ? kleur.green("  (default)") : "")],
    [kleur.cyan("name"), c.name ?? "-"],
    [kleur.cyan("city"), c.city ?? "-"],
    [kleur.cyan("country"), c.country ?? "-"],
    [kleur.cyan("id"), String(c.id ?? "-")],
    [kleur.cyan("users"), String(c.users_count ?? "-")],
  );
  console.log(t.toString());
}

export function campusTable(rows: any[]): void {
  const t = new Table({
    head: ["id", "name", "city", "country", "slug"].map((s) => kleur.bold(s)),
    chars: TABLE_CHARS,
    colAligns: ["right", "left", "left", "left", "left"],
  });
  for (const r of rows) {
    const slug = (r.name ?? "").toLowerCase().replace(/\s+/g, "-");
    t.push([
      String(r.id ?? ""),
      r.name ?? "",
      r.city ?? "",
      r.country ?? "",
      kleur.cyan(slug),
    ]);
  }
  console.log(t.toString());
}

// Borderless index of a campus's clusters: occupied/total seats and how many
// of your friends are seated in each.
export function clusterIndexTable(
  rows: { label: string; occupied: number; total: number; friends: number }[],
): void {
  if (rows.length === 0) return;
  const labelW = Math.max(...rows.map((r) => r.label.length));
  const occW = Math.max(...rows.map((r) => `${r.occupied}/${r.total}`.length));
  for (const r of rows) {
    const occ = `${r.occupied}/${r.total}`.padStart(occW);
    const friends =
      r.friends > 0
        ? kleur.cyan(`${r.friends} ${r.friends === 1 ? "friend" : "friends"}`)
        : kleur.dim("0 friends");
    console.log(` ${r.label.padEnd(labelW)}   ${occ}   ${friends}`);
  }
}

export function activeTable(locations: any[], title: string): void {
  if (locations.length === 0) {
    console.log(kleur.dim("nobody is active"));
    return;
  }
  console.log(kleur.bold(title));
  const t = new Table({
    head: ["login", "host", "since", "duration"].map((s) => kleur.bold(s)),
    chars: TABLE_CHARS,
    colAligns: ["left", "left", "left", "right"],
  });
  for (const loc of locations) {
    const u = loc.user ?? {};
    t.push([
      kleur.cyan(u.login ?? "-"),
      loc.host ?? "-",
      fmtTime(loc.begin_at),
      fmtDuration(loc.begin_at),
    ]);
  }
  console.log(t.toString());
}

export function friendsTable(rows: { login: string; display_name: string; added: string }[]): void {
  if (rows.length === 0) {
    console.log(
      kleur.dim("no friends yet — add some with `japonette friends add <login>`"),
    );
    return;
  }
  const t = new Table({
    head: ["login", "name", "added"].map((s) => kleur.bold(s)),
    chars: TABLE_CHARS,
  });
  for (const r of rows) t.push([kleur.cyan(r.login), r.display_name || "-", r.added || "-"]);
  console.log(t.toString());
}

function fmtHM(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}m`;
}

export function logtimeTable(
  buckets: { ym: string; seconds: number }[],
  title: string,
  totalDays: number,
): void {
  console.log(kleur.bold(title));
  if (buckets.length === 0) {
    console.log(kleur.dim("no logtime in this range"));
    return;
  }
  const max = Math.max(...buckets.map((b) => b.seconds), 1);
  const BAR_WIDTH = 20;
  const bar = (s: number): string => {
    const filled = Math.round((s / max) * BAR_WIDTH);
    return "█".repeat(filled) + " ".repeat(BAR_WIDTH - filled);
  };
  const t = new Table({
    head: ["month", "total", ""].map((s) => kleur.bold(s)),
    chars: TABLE_CHARS,
    colAligns: ["left", "right", "left"],
  });
  for (const b of buckets) {
    t.push([b.ym, fmtHM(b.seconds), bar(b.seconds)]);
  }
  const grandTotal = buckets.reduce((a, b) => a + b.seconds, 0);
  const avgPerDay = totalDays > 0 ? Math.floor(grandTotal / totalDays) : 0;
  t.push([
    kleur.bold("total"),
    kleur.bold(fmtHM(grandTotal)),
    kleur.dim(`avg ${fmtHM(avgPerDay)}/day`),
  ]);
  console.log(t.toString());
}

function fmtSpan(begin: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(begin).getTime();
  return Number.isFinite(ms) ? fmtHM(Math.max(0, Math.floor(ms / 1000))) : "-";
}

// Your upcoming evaluation slots, one row per window. Open windows get a number
// (#1..n) for `review cancel <n>`; booked ones name who took them and carry no
// number (they can't be cancelled).
export function slotsTable(
  windows: { begin: string; end: string; ids: number[]; booked: boolean; bookedBy?: string }[],
): void {
  if (windows.length === 0) {
    console.log(
      kleur.dim("no upcoming slots — open one with `japonette review open today 14:00-16:00`"),
    );
    return;
  }
  const t = new Table({
    head: ["#", "when", "duration", "status"].map((s) => kleur.bold(s)),
    chars: TABLE_CHARS,
    colAligns: ["right", "left", "right", "left"],
  });
  let n = 0;
  for (const w of windows) {
    const status = w.booked
      ? kleur.green("booked") + (w.bookedBy ? kleur.dim(` ${w.bookedBy}`) : "")
      : kleur.dim("open");
    t.push([
      w.booked ? kleur.dim("—") : String(++n),
      `${fmtTime(w.begin)} → ${fmtTime(w.end).slice(11)}`,
      fmtSpan(w.begin, w.end),
      status,
    ]);
  }
  console.log(t.toString());
}

// Your upcoming evaluations from /v2/me/scale_teams, in both directions — slots
// of yours that got filled, plus any project you're being evaluated on.
export function scaleTeamsTable(teams: any[]): void {
  const now = Date.now();
  const upcoming = teams
    .filter((t) => t.begin_at && new Date(t.begin_at).getTime() + 3_600_000 > now)
    .sort((a, b) => String(a.begin_at).localeCompare(String(b.begin_at)));
  if (upcoming.length === 0) {
    console.log(kleur.dim("no upcoming evaluations"));
    return;
  }
  const t = new Table({
    head: ["when", "team", "corrector", "correcteds"].map((s) => kleur.bold(s)),
    chars: TABLE_CHARS,
  });
  for (const st of upcoming) {
    const correcteds = (st.correcteds ?? [])
      .map((c: any) => c?.login)
      .filter(Boolean)
      .join(", ");
    t.push([
      fmtTime(st.begin_at),
      st.team?.name ?? "-",
      kleur.cyan(st.corrector?.login ?? "-"),
      correcteds || "-",
    ]);
  }
  console.log(t.toString());
}

export function friendsOnlineTable(active: any[], offline: string[]): void {
  if (active.length === 0) {
    console.log(kleur.dim("no friends active"));
  } else {
    const t = new Table({
      head: ["login", "host", "since", "duration"].map((s) => kleur.bold(s)),
      chars: TABLE_CHARS,
      colAligns: ["left", "left", "left", "right"],
    });
    for (const loc of active) {
      const u = loc.user ?? {};
      t.push([
        kleur.cyan(u.login ?? "-"),
        loc.host ?? "-",
        fmtTime(loc.begin_at),
        fmtDuration(loc.begin_at),
      ]);
    }
    console.log(t.toString());
  }
  if (offline.length > 0) {
    console.log(kleur.dim("offline:") + " " + [...offline].sort().join(", "));
  }
}
