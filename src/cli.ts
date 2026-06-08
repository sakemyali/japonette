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
import { loginCmd, whoamiCmd } from "./commands/login.js";
import { logoutCmd } from "./commands/logout.js";
import { logtimeCmd } from "./commands/logtime.js";
import { uninstallCmd } from "./commands/uninstall.js";
import { userCmd } from "./commands/user.js";

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
  .command("whoami")
  .description("Verify the cached token by hitting /v2/oauth/token/info.")
  .action(whoamiCmd);

program
  .command("user <login>")
  .description("Look up a 42 user.")
  .action(userCmd);

const campus = program
  .command("campus")
  .description("Show the default campus (auto-detected on first run).")
  .action(campusCurrentCmd);
campus
  .command("list")
  .description("List all campuses (fetched live; refreshes the local cache).")
  .action(() => campusListCmd());
campus
  .command("set <slug>")
  .description("Set the default campus used by commands that take --campus.")
  .action(campusSetCmd);

program
  .command("active")
  .description("Who's currently logged in at the campus.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .option("-n, --limit <n>", "max rows to show", "50")
  .action(activeCmd);

program
  .command("logtime [login]")
  .description("Per-month logtime totals for a user (defaults to you).")
  .option("-d, --days <n>", "range as days back from today (mutually exclusive with --months)")
  .option("-m, --months <n>", "range as months back from today (default: 4)")
  .action((login: string | undefined, opts: { days?: string; months?: string }) =>
    logtimeCmd(login, opts),
  );

program
  .command("cluster")
  .description("ASCII map of a campus cluster with live occupancy.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .option("--name <cluster>", "cluster file name (e.g. c1)")
  .option("-u, --user <login>", "highlight this user's seat with X (auto-picks cluster)")
  .option("--me", "highlight your own seat (shortcut for --user <your-login>)")
  .option("--no-occupancy", "skip the live API call; render an empty map")
  .action(clusterCmd);

const friends = program
  .command("friends")
  .description("Local friends watchlist (stored on this machine only).");
friends
  .command("add <login>")
  .description("Validate the login against the API, then append it to the local list.")
  .action(friendsAddCmd);
friends
  .command("remove <login>")
  .description("Remove a login from your local friends list.")
  .action(friendsRemoveCmd);
friends
  .command("list")
  .description("Show all friends in your local list.")
  .action(friendsListCmd);
friends
  .command("online")
  .description("Show which of your friends are currently active at the campus.")
  .option("-c, --campus <slug>", "campus slug (defaults to your saved campus)")
  .action(friendsOnlineCmd);

program.parseAsync(process.argv).catch((e: unknown) => {
  process.stderr.write(String(e instanceof Error ? e.message : e) + "\n");
  process.exit(1);
});
