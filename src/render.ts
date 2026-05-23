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

function fmtTime(s: string | null | undefined): string {
  const d = parseIso(s);
  if (!d) return "-";
  return d.toLocaleString("sv-SE", { hour12: false }).slice(0, 16);
}

function fmtDuration(begin: string | null | undefined): string {
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

export function userCard(u: any): void {
  const cursusUsers: any[] = u.cursus_users ?? [];

  const findBySlug = (predicate: (slug: string) => boolean) =>
    cursusUsers.find((cu) => predicate(String(cu?.cursus?.slug ?? "").toLowerCase()));

  const main =
    findBySlug((s) => s === "42cursus") ??
    findBySlug((s) => s.includes("cursus") && !s.includes("piscine"));
  const piscine = findBySlug((s) => s.includes("piscine"));

  const fmtLevel = (cu: any | undefined): string =>
    cu && typeof cu.level === "number"
      ? `${cu.level.toFixed(2)} (${cu.cursus?.slug ?? "?"})`
      : "-";

  const primary = (u.campus_users ?? []).find((c: any) => c.is_primary);
  const campusId = primary ? String(primary.campus_id) : "-";

  const t = new Table({ chars: TABLE_CHARS, style: { head: [], border: [] } });
  t.push(
    [kleur.cyan("login"), u.login ?? "-"],
    [kleur.cyan("name"), u.displayname ?? u.usual_full_name ?? "-"],
    [kleur.cyan("email"), u.email ?? "-"],
    [kleur.cyan("cursus"), fmtLevel(main)],
    [kleur.cyan("piscine"), fmtLevel(piscine)],
    [kleur.cyan("location"), u.location ?? "offline"],
    [kleur.cyan("campus_id"), campusId],
    [kleur.cyan("pool"), `${u.pool_month ?? "-"} ${u.pool_year ?? "-"}`],
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
