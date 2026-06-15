import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiDelete, apiGet, ApiError, apiPost } from "../client.js";
import { err, fmtTime, scaleTeamsTable, slotsTable, withSpinner } from "../render.js";
import {
  groupSlots,
  inScaleTeamRole,
  parseSlotArgs,
  pickOpenWindow,
  type RawSlot,
  type SlotWindow,
} from "../slots.js";

// Turn an API error body into one readable line. The slots endpoint returns
// either `{"error":"…"}` (400) or `{"errors":{"begin_at":["…"]}}` (422); show
// the message(s) instead of dumping JSON.
function formatApiError(body: string): string | null {
  try {
    const o = JSON.parse(body);
    if (o?.errors && typeof o.errors === "object") {
      return Object.entries(o.errors)
        .map(([f, msgs]) => `${f}: ${(Array.isArray(msgs) ? msgs : [msgs]).join(", ")}`)
        .join("; ");
    }
    if (typeof o?.error === "string") return o.error;
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

// Slot/scale_team calls need the `projects` OAuth scope. A token minted before
// that scale was added gets a 403 "Insufficient scope" — point the user at a
// re-login rather than surfacing the raw API error.
function handleErr(e: unknown): never {
  if (e instanceof ApiError && e.status === 403 && /scope/i.test(e.body)) {
    err("this needs the `projects` scope — run `japonette login` again to grant it.");
    process.exit(1);
  }
  if (e instanceof ApiError) {
    err(formatApiError(e.body) ?? e.message);
    process.exit(1);
  }
  if (e instanceof AuthError || e instanceof Error) {
    err(e.message);
    process.exit(1);
  }
  throw e;
}

// `review open [day] <start> <duration>` (or `[day] <HH:MM-HH:MM>`) — declare
// yourself available to evaluate. The API enforces its limits (≥30 min ahead,
// ≤2 weeks, campus min duration) and snaps to a 15-min grid, splitting the
// window into 15-min slots; we echo back the snapped times it actually created.
export async function reviewOpenCmd(args: string[]): Promise<void> {
  try {
    const { begin, end } = parseSlotArgs(args);
    const me = await withSpinner("checking your account...", () => apiGet<any>("/v2/me"));
    const created = await withSpinner("opening slot...", () =>
      apiPost<RawSlot[] | RawSlot>("/v2/slots", {
        slot: {
          user_id: me.id,
          begin_at: begin.toISOString(),
          end_at: end.toISOString(),
        },
      }),
    );
    // Echo the times the API actually used (it floors to the 15-min grid).
    const arr = Array.isArray(created) ? created : [created];
    const begins = arr.map((s) => s.begin_at).filter(Boolean).sort();
    const ends = arr.map((s) => s.end_at).filter(Boolean).sort();
    const first = begins[0] ?? begin.toISOString();
    const last = ends[ends.length - 1] ?? end.toISOString();
    console.log(
      kleur.green(`opened ${arr.length} × 15-min slot${arr.length === 1 ? "" : "s"}`) +
        kleur.dim(`  ${fmtTime(first)} → ${fmtTime(last).slice(11)}`),
    );
    console.log(kleur.dim("see them with `japonette review list`."));
  } catch (e) {
    handleErr(e);
  }
}

// Your upcoming availability as merged windows (contiguous open slots folded
// into one), shared by `review list` and `review cancel` so their numbering
// agrees.
async function fetchUpcomingWindows(): Promise<SlotWindow[]> {
  // Newest-first: with years of history, an ascending page-1 is all past slots
  // and the upcoming ones never show. -begin_at puts the future on page 1
  // (groupSlots re-sorts ascending for display).
  const slots = await withSpinner("fetching your slots...", () =>
    apiGet<RawSlot[]>("/v2/me/slots", { "page[size]": 100, sort: "-begin_at" }),
  );
  const now = Date.now();
  const upcoming = (slots ?? []).filter((s) => new Date(s.end_at).getTime() > now);
  return groupSlots(upcoming);
}

const whenLabel = (w: SlotWindow) => `${fmtTime(w.begin)} → ${fmtTime(w.end).slice(11)}`;

// `review list` — the availability slots you've opened, open vs. already booked.
// Open windows are numbered (#1..n) for `review cancel`.
export async function reviewSlotsCmd(): Promise<void> {
  try {
    slotsTable(await fetchUpcomingWindows());
  } catch (e) {
    handleErr(e);
  }
}

// Withdraw every 15-min slot in one open window, then report it.
async function cancelWindow(w: SlotWindow): Promise<void> {
  await withSpinner(`cancelling ${whenLabel(w)}...`, async () => {
    for (const id of w.ids) await apiDelete(`/v2/slots/${id}`);
  });
  console.log(
    kleur.green("✓ cancelled ") + whenLabel(w) + kleur.dim(`  (${w.ids.length} × 15-min)`),
  );
}

// `review cancel [n]` — cancel an open slot by the number shown in `review list`
// (cancels the whole window at once). With no number, list the open windows and
// prompt for one. Booked windows can't be cancelled, so only open ones number.
export async function reviewCancelCmd(n?: string): Promise<void> {
  try {
    const windows = await fetchUpcomingWindows();
    const open = windows.filter((w) => !w.booked);

    if (n !== undefined) {
      const w = pickOpenWindow(windows, Number(n));
      if (!w) {
        err(`no open slot #${n} — you have ${open.length}. See \`japonette review list\`.`);
        process.exit(1);
      }
      await cancelWindow(w);
      return;
    }

    if (open.length === 0) {
      console.log(kleur.dim("no open slots to cancel."));
      return;
    }
    slotsTable(windows);
    const rl = createInterface({ input, output });
    let answer: string;
    try {
      answer = (await rl.question("\ncancel which # (blank to abort): ")).trim();
    } finally {
      rl.close();
    }
    if (answer === "" || answer.toLowerCase() === "q") {
      console.log(kleur.dim("aborted"));
      return;
    }
    const w = pickOpenWindow(windows, Number(answer));
    if (!w) {
      err(`no open slot #${answer} — you have ${open.length}.`);
      process.exit(1);
    }
    await cancelWindow(w);
  } catch (e) {
    handleErr(e);
  }
}

// `review booked` — evaluations on your calendar, both directions: a slot of
// yours that got filled (you're the corrector) and any project you're being
// evaluated on.
export async function reviewBookedCmd(
  opts: { giving?: boolean; receiving?: boolean } = {},
): Promise<void> {
  try {
    // --giving / --receiving narrow by side; neither (or both) shows all.
    const role = opts.giving && !opts.receiving
      ? "giving"
      : opts.receiving && !opts.giving
        ? "receiving"
        : null;
    // Newest-first so upcoming evaluations aren't buried under years of past
    // ones on page 1 (scaleTeamsTable filters to the future and re-sorts).
    const teams = await withSpinner("fetching your evaluations...", () =>
      apiGet<any[]>("/v2/me/scale_teams", { "page[size]": 100, sort: "-begin_at" }),
    );
    let rows = teams ?? [];
    if (role) {
      const me = await apiGet<any>("/v2/me");
      rows = rows.filter((t) => inScaleTeamRole(t, me.id, role));
    }
    scaleTeamsTable(rows);
  } catch (e) {
    handleErr(e);
  }
}
