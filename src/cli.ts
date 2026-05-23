#!/usr/bin/env node
import { Command } from "commander";

import { activeCmd } from "./commands/active.js";
import {
  campusCurrentCmd,
  campusListCmd,
  campusSetCmd,
} from "./commands/campus.js";
import {
  friendsAddCmd,
  friendsListCmd,
  friendsOnlineCmd,
  friendsRemoveCmd,
} from "./commands/friends.js";
import { loginCmd, whoamiCmd } from "./commands/login.js";
import { logoutCmd } from "./commands/logout.js";
import { uninstallCmd } from "./commands/uninstall.js";
import { userCmd } from "./commands/user.js";

const VERSION = "0.1.0";

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
  .option("--refresh", "bypass the local cache", false)
  .description("List all campuses (cached locally for fast reuse).")
  .action((opts: { refresh: boolean }) => campusListCmd(opts.refresh));
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
