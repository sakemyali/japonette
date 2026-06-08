#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { activeCmd } from "./commands/active.js";
import {
  campusCurrentCmd,
  campusListCmd,
  campusSetCmd,
} from "./commands/campus.js";
import { clusterCmd } from "./commands/cluster.js";
import {
  friendsAddCmd,
  friendsListCmd,
  friendsOnlineCmd,
  friendsRemoveCmd,
} from "./commands/friends.js";
import { loginCmd } from "./commands/login.js";
import { logoutCmd } from "./commands/logout.js";
import { logtimeCmd } from "./commands/logtime.js";
import { uninstallCmd } from "./commands/uninstall.js";
import { meCmd, userCmd } from "./commands/user.js";
import { configureGroupedHelp } from "./help.js";

// Read the version from package.json so it can never drift from the
// published version. From dist/cli.js this resolves to ../package.json,
// which npm always includes in the published tarball.
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
) as { version: string };
const VERSION = pkg.version;

const program = new Command();
program
  .name("japonette")
  .description("A small CLI for the 42 API.")
  .version(VERSION);

// Group the root help by category instead of one flat command dump.
configureGroupedHelp(program);

program
  .command("login")
  .description("Log into your 42 account via the browser.")
  .action(loginCmd);

program
  .command("logout")
  .description("Delete the locally cached access + refresh tokens.")
  .action(logoutCmd);

program
  .command("uninstall")
  .description("Wipe all local state (tokens, config, friends, campus cache).")
  .option("-y, --yes", "skip the confirmation prompt", false)
  .action(uninstallCmd);

program
  .command("me")
  .description("Your own profile — identity + live location (cluster map if online).")
  .option("--info", "also show the academic profile (cursus, piscine, campus, pool)")
  .action((opts: { info?: boolean }) => meCmd(opts));

program
  .command("user <login>")
  .description("Look up a 42 user — identity + live location (cluster map if online).")
  .option("--info", "also show the academic profile (cursus, piscine, campus, pool)")
  .action((login: string, opts: { info?: boolean }) => userCmd(login, opts));

const campus = program
  .command("campus")
  .description("Who's at your campus right now.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .option("-n, --limit <n>", "max rows to show", "50")
  .action((opts: { campus?: string; limit?: string }) => activeCmd(opts));
campus
  .command("online")
  .description("Explicit alias of `campus` — who's at the campus now.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .option("-n, --limit <n>", "max rows to show", "50")
  .action((opts: { campus?: string; limit?: string }) => activeCmd(opts));
campus
  .command("list")
  .description("List all campuses (fetched live; refreshes the local cache).")
  .action(() => campusListCmd());
campus
  .command("set [slug]")
  .description("Show your default campus, or set it when given a slug.")
  .action((slug: string | undefined) =>
    slug ? campusSetCmd(slug) : campusCurrentCmd(),
  );

program
  .command("logtime [login]")
  .description("Per-month logtime totals for a user (defaults to you).")
  .option("-d, --days <n>", "range as days back from today (mutually exclusive with --months)")
  .option("-m, --months <n>", "range as months back from today (default: 4)")
  .action((login: string | undefined, opts: { days?: string; months?: string }) =>
    logtimeCmd(login, opts),
  );

program
  .command("cluster [id]")
  .description("List the campus's clusters (occupancy + friends), or open one's map by name or code.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .action((id: string | undefined, opts: { campus?: string }) => clusterCmd(id, opts));

// Bare `friends` runs the daily action — who's online — and the watchlist is
// managed through explicit verbs. `friends online` is kept as an explicit
// alias of the bare command.
const friends = program
  .command("friends")
  .description("Which of your friends are at the campus right now.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .action(friendsOnlineCmd);
friends
  .command("online")
  .description("Explicit alias of `friends` — which friends are at the campus.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .action(friendsOnlineCmd);
friends
  .command("list")
  .description("Show all friends in your local watchlist.")
  .action(friendsListCmd);
friends
  .command("add <login>")
  .description("Validate the login against the API, then append it to the local list.")
  .action(friendsAddCmd);
friends
  .command("remove <login>")
  .description("Remove a login from your local friends list.")
  .action(friendsRemoveCmd);

program.parseAsync(process.argv).catch((e: unknown) => {
  process.stderr.write(String(e instanceof Error ? e.message : e) + "\n");
  process.exit(1);
});
