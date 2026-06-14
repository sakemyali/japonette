import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiDelete, apiGet, ApiError, apiPost } from "../client.js";
import { err, fmtTime, scaleTeamsTable, slotsTable, withSpinner } from "../render.js";
import { groupSlots, parseSlotRange, type RawSlot } from "../slots.js";

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
    console.log(kleur.dim("see them with `japonette review`."));
  } catch (e) {
    handleErr(e);
  }
}

// `review slots` — your upcoming availability, open vs. already booked.
export async function reviewSlotsCmd(): Promise<void> {
  try {
    const slots = await withSpinner("fetching your slots...", () =>
      apiGet<RawSlot[]>("/v2/me/slots", { "page[size]": 100, sort: "begin_at" }),
    );
    const now = Date.now();
    const upcoming = (slots ?? []).filter((s) => new Date(s.end_at).getTime() > now);
    slotsTable(groupSlots(upcoming));
  } catch (e) {
    handleErr(e);
  }
}

// `review cancel <id>` — withdraw one 15-min slot. The API refuses if it has
// already been booked.
export async function reviewCancelCmd(id: string): Promise<void> {
  try {
    await withSpinner(`cancelling slot ${id}...`, () =>
      apiDelete(`/v2/slots/${encodeURIComponent(id)}`),
    );
    console.log(kleur.green(`slot ${id} cancelled.`));
  } catch (e) {
    handleErr(e);
  }
}

// `review booked` — evaluations on your calendar, both directions: a slot of
// yours that got filled (you're the corrector) and any project you're being
// evaluated on.
export async function reviewBookedCmd(): Promise<void> {
  try {
    const teams = await withSpinner("fetching your evaluations...", () =>
      apiGet<any[]>("/v2/me/scale_teams", { "page[size]": 100, sort: "begin_at" }),
    );
    scaleTeamsTable(teams ?? []);
  } catch (e) {
    handleErr(e);
  }
}
