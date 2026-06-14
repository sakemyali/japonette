import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiDelete, apiGet, ApiError, apiPost } from "../client.js";
import { err, fmtTime, scaleTeamsTable, slotsTable, withSpinner } from "../render.js";
import {
  groupSlots,
  inScaleTeamRole,
  parseSlotRange,
  pickOpenWindow,
  type RawSlot,
  type SlotWindow,
} from "../slots.js";

// Slot/scale_team calls need the `projects` OAuth scope. A token minted before
// that scale was added gets a 403 "Insufficient scope" — point the user at a
// re-login rather than surfacing the raw API error.
function handleErr(e: unknown): never {
  if (e instanceof ApiError && e.status === 403 && /scope/i.test(e.body)) {
    err("this needs the `projects` scope — run `japonette login` again to grant it.");
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

// `review open [day] <HH:MM-HH:MM>` — declare yourself available to evaluate.
// The day is optional and defaults to today. The 42 API splits the interval
// into 15-min slots; people get matched to one when they book their project,
// and your slot shows as `booked`.
export async function reviewOpenCmd(when: string, range?: string): Promise<void> {
  try {
    // One positional → it's the range, day is today. Two → day + range.
    const [day, span] = range === undefined ? ["today", when] : [when, range];
    const { begin, end } = parseSlotRange(day, span);
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
    const n = Array.isArray(created) ? created.length : 1;
    console.log(
      kleur.green(`opened ${n} × 15-min slot${n === 1 ? "" : "s"}`) +
        kleur.dim(`  ${fmtTime(begin.toISOString())} → ${fmtTime(end.toISOString()).slice(11)}`),
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
  const slots = await withSpinner("fetching your slots...", () =>
    apiGet<RawSlot[]>("/v2/me/slots", { "page[size]": 100, sort: "begin_at" }),
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
    const teams = await withSpinner("fetching your evaluations...", () =>
      apiGet<any[]>("/v2/me/scale_teams", { "page[size]": 100, sort: "begin_at" }),
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
