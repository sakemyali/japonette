import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiGet, ApiError } from "../client.js";
import {
  ClusterFile,
  findClusterForHost,
  renderCluster,
  styleEmpty,
  styleOccupied,
  styleTarget,
} from "../cluster-map.js";
import { err, primaryCampus, userCardLines, withSpinner } from "../render.js";
import { fetchActiveLocations } from "./active.js";

interface Presence {
  file: ClusterFile;
  code: string;
  host: string;
  activeByHost: Map<string, any>;
}

// Resolve the user's cluster + live occupancy, if they're online and their
// campus has a contributed map. Fetched before any output so the spinner
// clears cleanly above the rendered card.
async function resolvePresence(u: any): Promise<Presence | null> {
  const host: string | undefined = u.location || undefined;
  if (!host) return null;
  const campus = primaryCampus(u);
  if (!campus) return null;
  const found = findClusterForHost(campus.slug, host);
  if (!found) return null;

  const locs = await withSpinner(`fetching ${campus.slug} occupancy...`, () =>
    fetchActiveLocations(campus.id, 1000),
  );
  const activeByHost = new Map<string, any>();
  for (const l of locs) if (l.host) activeByHost.set(l.host, l);
  return { file: found.file, code: found.name, host, activeByHost };
}

// Render a user payload. When they're online with a mapped cluster, the
// cluster label + legend sit in the empty space to the right of the card
// (no vertical gap), with the map below. Otherwise just the card.
async function renderUser(data: any, info: boolean): Promise<void> {
  const presence = await resolvePresence(data);
  const cardLines = userCardLines(data, { info });

  if (!presence) {
    console.log(cardLines.join("\n"));
    return;
  }

  // Legend lines placed beside the card. Every card line has the same visible
  // width, so a fixed gap keeps the right column aligned without padding.
  const aside = [
    kleur.bold(presence.file.name) + kleur.dim(`  (${presence.code})`),
    `${styleTarget()} ${kleur.dim(data.login ?? "here")}`,
    `${styleOccupied()} occupied`,
    `${styleEmpty()} empty`,
  ];
  const rows = Math.max(cardLines.length, aside.length);
  for (let i = 0; i < rows; i++) {
    const left = cardLines[i] ?? "";
    const right = aside[i];
    console.log(right ? `${left}   ${right}` : left);
  }

  console.log("");
  for (const line of renderCluster(presence.file, presence.activeByHost, presence.host)) {
    console.log(line);
  }
}

export async function userCmd(
  login: string,
  opts: { info?: boolean } = {},
): Promise<void> {
  try {
    const data = await apiGet<any>(`/v2/users/${encodeURIComponent(login)}`);
    await renderUser(data, opts.info ?? false);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      err(`user not found: ${login}`);
      process.exit(1);
    }
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
}

// `me` is `user` pointed at yourself: same presence-first card and map, no
// login argument. A successful /v2/me also proves the cached token works,
// covering the old `whoami` check. Unlike `user`, the full academic card is
// the default — it's your own profile, no reason to hide the detail.
export async function meCmd(opts: { info?: boolean } = {}): Promise<void> {
  try {
    const data = await apiGet<any>("/v2/me");
    await renderUser(data, opts.info ?? true);
  } catch (e) {
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
}
