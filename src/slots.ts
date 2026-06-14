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

// Resolve a `day` token to local midnight: "today", "tomorrow", or YYYY-MM-DD.
function resolveDay(day: string, now: Date): Date {
  const d = day.trim().toLowerCase();
  if (d === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d === "tomorrow")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`bad day "${day}" — use "today", "tomorrow", or YYYY-MM-DD`);
  }
  const [, y, mo, da] = m;
  return new Date(Number(y), Number(mo) - 1, Number(da));
}

function atTime(base: Date, hh: number, mm: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0);
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
  const begin = atTime(base, Number(sh), Number(sm ?? 0));
  const end = atTime(base, Number(eh), Number(em ?? 0));
  if (end <= begin) throw new Error("end time must be after start time");
  return { begin, end };
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
    if (last && !booked && !last.booked && last.end === s.begin_at) {
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
