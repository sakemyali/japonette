import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiGet, ApiError } from "../client.js";
import {
  findClusterForHost,
  renderCluster,
  styleEmpty,
  styleOccupied,
  styleTarget,
} from "../cluster-map.js";
import { err, primaryCampus, userCard, withSpinner } from "../render.js";
import { fetchActiveLocations } from "./active.js";

// Draw the user's cluster map with their seat marked, if they're online and
// their campus has a contributed map. Pulls live occupancy so the rest of the
// room shows too.
async function drawPresenceMap(u: any): Promise<void> {
  const host: string | undefined = u.location || undefined;
  if (!host) return;
  const campus = primaryCampus(u);
  if (!campus) return;
  const found = findClusterForHost(campus.slug, host);
  if (!found) return;

  const locs = await withSpinner(
    `fetching ${campus.slug} occupancy...`,
    () => fetchActiveLocations(campus.id, 1000),
  );
  const activeByHost = new Map<string, any>();
  for (const l of locs) if (l.host) activeByHost.set(l.host, l);

  console.log("");
  console.log(kleur.bold(found.file.name) + kleur.dim(`  (${found.name})`));
  console.log(
    `${styleTarget()} ${kleur.dim(u.login ?? "here")}   ${styleOccupied()} occupied   ${styleEmpty()} empty`,
  );
  console.log("");
  for (const line of renderCluster(found.file, activeByHost, host)) {
    console.log(line);
  }
}

export async function userCmd(
  login: string,
  opts: { info?: boolean } = {},
): Promise<void> {
  try {
    const data = await apiGet<any>(`/v2/users/${encodeURIComponent(login)}`);
    userCard(data, { info: opts.info ?? false });
    await drawPresenceMap(data);
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
