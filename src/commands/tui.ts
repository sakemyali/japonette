import { AuthError } from "../auth.js";
import { ApiError } from "../client.js";
import { err } from "../render.js";

export interface TuiCmdOpts {
  campus?: string;
}

// `japonette tui` — the interactive dashboard. Requires an interactive terminal
// (it takes over the screen + mouse); in a pipe / non-TTY it bails with a hint
// rather than emitting control codes into a log.
export async function tuiCmd(opts: TuiCmdOpts = {}): Promise<void> {
  if (!process.stdout.isTTY) {
    err("`japonette tui` needs an interactive terminal (stdout is not a TTY).");
    process.exit(1);
  }
  try {
    const { runDashboard } = await import("../tui/dashboard.js");
    await runDashboard(opts.campus);
  } catch (e) {
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
