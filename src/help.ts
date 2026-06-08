// Grouped root help. Commander 12 has no native command grouping (that landed
// in v13), so we install a custom root-help formatter that lists commands by
// category instead of one flat dump. Subcommand help (`japonette <cmd> --help`)
// keeps commander's default layout.
//
// NOTE: the groups below are a hand-maintained view of the command surface. If
// you add or rename a command, update it here too.
import { Command, Help } from "commander";
import kleur from "kleur";

export interface HelpGroup {
  title: string;
  commands: Array<{ name: string; summary: string }>;
}

export const COMMAND_GROUPS: HelpGroup[] = [
  {
    title: "Account",
    commands: [
      { name: "login", summary: "browser-based 42 OAuth login" },
      { name: "logout", summary: "delete cached tokens" },
      { name: "me", summary: "your profile + live location" },
      { name: "uninstall", summary: "wipe all local state" },
    ],
  },
  {
    title: "Campus & presence",
    commands: [
      { name: "campus", summary: "who's at your campus right now" },
      { name: "campus list", summary: "all campuses + their slugs" },
      { name: "campus set [slug]", summary: "show or set your default campus" },
      { name: "cluster [id]", summary: "cluster occupancy index, or one map" },
    ],
  },
  {
    title: "People",
    commands: [
      { name: "user <login>", summary: "look up a 42 user" },
      { name: "logtime [login]", summary: "per-month logtime totals" },
    ],
  },
  {
    title: "Friends",
    commands: [
      { name: "friends", summary: "which friends are at the campus" },
      { name: "friends list", summary: "show your watchlist" },
      { name: "friends add <login>", summary: "add a login to the watchlist" },
      { name: "friends remove <login>", summary: "remove a login" },
    ],
  },
];

// Width of the widest command name across all groups, for column alignment.
function commandPadWidth(): number {
  let w = 0;
  for (const g of COMMAND_GROUPS) {
    for (const c of g.commands) w = Math.max(w, c.name.length);
  }
  return w;
}

function formatRootHelp(cmd: Command, helper: Help): string {
  const pad = Math.max(commandPadWidth(), 16);
  const lines: string[] = [];

  const desc = cmd.description();
  lines.push(`${kleur.bold(cmd.name())}${desc ? ` — ${desc}` : ""}`);
  lines.push("");
  lines.push(`${kleur.bold("Usage:")} ${helper.commandUsage(cmd)}`);
  lines.push("");

  for (const group of COMMAND_GROUPS) {
    lines.push(kleur.bold(group.title));
    for (const c of group.commands) {
      lines.push(`  ${c.name.padEnd(pad)}  ${kleur.dim(c.summary)}`);
    }
    lines.push("");
  }

  const options = helper.visibleOptions(cmd);
  if (options.length > 0) {
    lines.push(kleur.bold("Options"));
    const optPad = Math.max(
      pad,
      ...options.map((o) => helper.optionTerm(o).length),
    );
    for (const o of options) {
      lines.push(
        `  ${helper.optionTerm(o).padEnd(optPad)}  ${kleur.dim(helper.optionDescription(o))}`,
      );
    }
    lines.push("");
  }

  lines.push(
    kleur.dim("Run `japonette <command> --help` for details on any command."),
  );
  return lines.join("\n") + "\n";
}

// Install the grouped formatter on the root program. Subcommands fall back to
// commander's stock help so per-command flag listings stay intact.
export function configureGroupedHelp(program: Command): void {
  program.configureHelp({
    formatHelp(cmd, helper) {
      if (cmd === program) return formatRootHelp(cmd, helper);
      return Help.prototype.formatHelp.call(helper, cmd, helper);
    },
  });
}
