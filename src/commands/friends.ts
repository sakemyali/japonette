import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiGet, ApiError } from "../client.js";
import {
  friendsAdd,
  friendsHas,
  friendsRemove,
  loadFriends,
  saveFriends,
} from "../config.js";
import { err, friendsOnlineTable, friendsTable } from "../render.js";
import { fetchActiveLocations, resolveCampus } from "./active.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function friendsAddCmd(login: string): Promise<void> {
  login = login.trim().toLowerCase();
  const friends = loadFriends();
  if (friendsHas(friends, login)) {
    console.log(kleur.dim(`${login} is already in your friends list`));
    return;
  }
  try {
    const user = await apiGet<any>(`/v2/users/${encodeURIComponent(login)}`);
    friendsAdd(friends, {
      login,
      display_name: user.displayname ?? user.usual_full_name ?? "",
      added: today(),
    });
    saveFriends(friends);
    console.log(kleur.green("+") + " added " + kleur.cyan(login));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      err(`login not found on intra: ${login}`);
      process.exit(1);
    }
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
}

export function friendsRemoveCmd(login: string): void {
  login = login.trim().toLowerCase();
  const friends = loadFriends();
  if (friendsRemove(friends, login)) {
    saveFriends(friends);
    console.log(kleur.red("-") + " removed " + kleur.cyan(login));
  } else {
    err(`${login} is not in your friends list`);
    process.exit(1);
  }
}

export function friendsListCmd(): void {
  const friends = loadFriends();
  friendsTable(friends.friends);
}

export async function friendsOnlineCmd(opts: { campus?: string }): Promise<void> {
  const friends = loadFriends();
  if (friends.friends.length === 0) {
    console.log(
      kleur.dim("no friends yet — add some with `japonette friends add <login>`"),
    );
    return;
  }
  const wanted = new Set(friends.friends.map((f) => f.login));
  try {
    const { id } = await resolveCampus(opts.campus);
    const locs = await fetchActiveLocations(id, 1000);
    const matched = locs.filter((l) => wanted.has(l?.user?.login));
    const activeLogins = new Set(matched.map((l) => l?.user?.login));
    const offline = [...wanted].filter((l) => !activeLogins.has(l));
    friendsOnlineTable(matched, offline);
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
