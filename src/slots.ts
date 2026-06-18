// Pure helpers for the `review` (evaluation slots) command: turning a friendly
// `day` + `HH:MM-HH:MM` into a concrete begin/end interval, and folding the 42
// API's 15-minute slot records back into human-readable windows. No I/O here so
// the parsing and grouping can be unit-tested directly.

export interface RawSlot {
  id: number;
  begin_at: string;
  end_at: string;
  scale_team?: unknown;
}

export interface SlotWindow {
  begin: string; // ISO
  end: string; // ISO
  ids: number[];
  booked: boolean;
  bookedBy?: string; // login of the team being evaluated, when booked
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

// Resolve a `day` token to local midnight: "today", "tomorrow", a weekday name
// (next occurrence, today-inclusive), or YYYY-MM-DD.
function resolveDay(day: string, now: Date): Date {
  const d = day.trim().toLowerCase();
  const midnight = (offsetDays: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  if (d === "today") return midnight(0);
  if (d === "tomorrow") return midnight(1);
  if (d in WEEKDAYS) return midnight((WEEKDAYS[d]! - now.getDay() + 7) % 7);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`bad day "${day}" — use today, tomorrow, a weekday (mon…sun), or YYYY-MM-DD`);
  }
  const [, y, mo, da] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(da));
  // Reject impossible dates (JS rolls 2026-02-31 over to March) by checking the
  // constructed date matches what was asked.
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(da)
  ) {
    throw new Error(`bad day "${day}" — not a real date`);
  }
  return date;
}

function isDayToken(t: string): boolean {
  const d = t.trim().toLowerCase();
  return d === "today" || d === "tomorrow" || d in WEEKDAYS || /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function atTime(base: Date, hh: number, mm: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0);
}

// Round a time up to the next 15-minute boundary. Slots live on a 15-min grid;
// rounding *up* keeps a relative start (e.g. now+30m) from slipping under the
// API's minimum-lead floor.
function snapUp15(d: Date): Date {
  const step = 15 * 60_000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

// Parse a clock token into a Date on `base`'s day: "14", "14:30", "2pm", "9am".
function parseClock(token: string, base: Date): Date {
  const m = token.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new Error(`bad time "${token}" — try 14, 14:30, or 2pm`);
  let hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  const ap = m[3];
  if (ap) {
    if (hh < 1 || hh > 12) throw new Error(`bad time "${token}"`);
    hh = (hh % 12) + (ap === "pm" ? 12 : 0);
  }
  if (hh > 23 || mm > 59) throw new Error(`bad time "${token}"`);
  return atTime(base, hh, mm);
}

// Parse a duration token into minutes: "2h", "90m", "1h30m", "45m".
function parseDuration(token: string): number {
  const m = token.trim().toLowerCase().match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  const mins = m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
  if (!m || mins <= 0) throw new Error(`bad duration "${token}" — try 1h, 90m, or 1h30m`);
  return mins;
}

// Resolve a start token to a concrete Date. Relative forms ("now", "soon",
// "+45m", "+1h") count from now (snapped up to the 15-min grid); clock forms
// land on `day`.
function parseStart(token: string, day: string, now: Date): Date {
  const t = token.trim().toLowerCase();
  if (t === "now" || t === "soon") return snapUp15(new Date(now.getTime() + 30 * 60_000));
  if (t.startsWith("+")) return snapUp15(new Date(now.getTime() + parseDuration(t.slice(1)) * 60_000));
  return parseClock(t, resolveDay(day, now));
}

// Parse `day` + `HH:MM-HH:MM` into a local begin/end interval. Throws a friendly
// Error on malformed input or a non-positive span. The caller converts to ISO.
export function parseSlotRange(
  day: string,
  range: string,
  now: Date = new Date(),
): { begin: Date; end: Date } {
  const base = resolveDay(day, now);
  // Minutes optional, so whole-hour shorthand "14-16" works as well as "14:00-16:00".
  const m = range.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) {
    throw new Error(`bad range "${range}" — expected HH:MM-HH:MM, e.g. 14:00-16:00 (or 14-16)`);
  }
  const [, sh, sm, eh, em] = m;
  const clamp = (h: number, mn: number) => {
    if (h > 23 || mn > 59) throw new Error(`bad range "${range}" — hours 0–23, minutes 0–59`);
  };
  clamp(Number(sh), Number(sm ?? 0));
  clamp(Number(eh), Number(em ?? 0));
  const begin = atTime(base, Number(sh), Number(sm ?? 0));
  const end = atTime(base, Number(eh), Number(em ?? 0));
  if (end <= begin) throw new Error("end time must be after start time");
  return { begin, end };
}

// Parse the positional args of `review open` into a begin/end interval. Forms,
// after an optional leading day (today / tomorrow / weekday / YYYY-MM-DD):
//   <start> <duration>   e.g. `14 1h`, `soon 90m`, `2pm 1h30m`, `+45m 1h`
//   <HH:MM-HH:MM>        e.g. `14:00-16:00`, `14-16`
// The 30-min-lead / 2-week / min-duration / 15-min-grid limits are enforced
// server-side (campus-configurable), so we don't pre-validate them here.
export function parseSlotArgs(
  tokens: string[],
  now: Date = new Date(),
): { begin: Date; end: Date } {
  const toks = tokens.map((t) => t.trim()).filter(Boolean);
  const usage =
    "usage: review open [day] <start> <duration>, e.g. `review open soon 1h` or `review open fri 2pm 90m`";
  if (toks.length === 0) throw new Error(usage);

  let day = "today";
  let rest = toks;
  if (toks.length >= 2 && isDayToken(toks[0]!)) {
    day = toks[0]!;
    rest = toks.slice(1);
  }

  if (rest.length === 1) {
    if (!/[-–]/.test(rest[0]!)) throw new Error(`missing duration — ${usage}`);
    return parseSlotRange(day, rest[0]!, now);
  }
  if (rest.length === 2) {
    const begin = parseStart(rest[0]!, day, now);
    const end = new Date(begin.getTime() + parseDuration(rest[1]!) * 60_000);
    return { begin, end };
  }
  throw new Error(usage);
}

// Which side of a booked evaluation you're on: "giving" = you're the corrector,
// "receiving" = you're among the correcteds. Used to filter `review booked`.
export function inScaleTeamRole(
  team: any,
  userId: number,
  role: "giving" | "receiving",
): boolean {
  if (role === "giving") return team?.corrector?.id === userId;
  return (team?.correcteds ?? []).some((c: any) => c?.id === userId);
}

// The nth (1-based) cancellable window. Only open windows are cancellable (the
// API refuses booked ones), so numbering skips booked — matching how `review
// list` numbers and what `review cancel <n>` selects. Null if out of range.
export function pickOpenWindow(windows: SlotWindow[], n: number): SlotWindow | null {
  const open = windows.filter((w) => !w.booked);
  return Number.isInteger(n) && n >= 1 && n <= open.length ? open[n - 1]! : null;
}

// The login of the team being evaluated on a booked slot, if discoverable.
function bookedPeer(scaleTeam: unknown): string | undefined {
  const st = scaleTeam as { correcteds?: { login?: string }[] } | null;
  return st?.correcteds?.map((c) => c.login).filter(Boolean).join(", ") || undefined;
}

// Fold raw 15-minute slot records into windows. Contiguous *open* slots merge
// into one window (so a 2h availability reads as one row); booked slots stay
// separate, since each is a distinct correction. Input is sorted by begin.
export function groupSlots(slots: RawSlot[]): SlotWindow[] {
  const sorted = [...slots].sort((a, b) => a.begin_at.localeCompare(b.begin_at));
  const windows: SlotWindow[] = [];
  for (const s of sorted) {
    const booked = s.scale_team != null;
    const last = windows[windows.length - 1];
    // Compare instants, not strings, so equivalent times in differing ISO
    // formats still count as contiguous.
    const contiguous =
      last !== undefined && new Date(last.end).getTime() === new Date(s.begin_at).getTime();
    if (last && !booked && !last.booked && contiguous) {
      last.end = s.end_at;
      last.ids.push(s.id);
      continue;
    }
    windows.push({
      begin: s.begin_at,
      end: s.end_at,
      ids: [s.id],
      booked,
      bookedBy: booked ? bookedPeer(s.scale_team) : undefined,
    });
  }
  return windows;
}
