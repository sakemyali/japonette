import kleur from "kleur";

import { AuthError } from "../auth.js";
import { ApiError } from "../client.js";
import {
  ClusterFile,
  listClusterNames,
  loadClusterFile,
  renderCluster,
  styleEmpty,
  styleOccupied,
} from "../cluster-map.js";
import { loadFriends } from "../config.js";
import { clusterIndexTable, err, withSpinner } from "../render.js";
import { fetchActiveLocations } from "./active.js";
import { resolveCampus } from "./campus.js";

type Loc = { host?: string; user?: { login?: string }; begin_at?: string };

function printNotFound(slug: string): void {
  console.log(
    kleur.dim(
      `no cluster map yet for "${slug}". Contribute one at https://github.com/sakemyali/japonette/tree/main/clusters`,
    ),
  );
}

async function fetchOccupancy(campusId: number, slug: string): Promise<Map<string, Loc>> {
  const locs = (await withSpinner(`fetching ${slug} occupancy...`, () =>
    fetchActiveLocations(campusId, 1000),
  )) as Loc[];
  const byHost = new Map<string, Loc>();
  for (const l of locs) if (l.host) byHost.set(l.host, l);
  return byHost;
}

// Match an id arg to a cluster by code (filename) or friendly name, case-
// insensitively. Code is checked first, so it wins any collision.
export function matchCluster(
  clusters: { code: string; file: ClusterFile }[],
  idArg: string,
): { code: string; file: ClusterFile } | null {
  const target = idArg.trim().toLowerCase();
  const byCode = clusters.find((c) => c.code.toLowerCase() === target);
  if (byCode) return byCode;
  return (
    clusters.find((c) => String(c.file.name ?? "").toLowerCase() === target) ?? null
  );
}

// Occupied/total seats and friend count for one cluster, from live occupancy.
export function summarizeCluster(
  file: ClusterFile,
  byHost: Map<string, Loc>,
  friendSet: Set<string>,
): { occupied: number; total: number; friends: number } {
  let occupied = 0;
  let friends = 0;
  for (const h of file.hosts) {
    const loc = byHost.get(h);
    if (!loc) continue;
    occupied++;
    const login = loc.user?.login;
    if (login && friendSet.has(login)) friends++;
  }
  return { occupied, total: file.hosts.length, friends };
}

function printClusterMap(code: string, file: ClusterFile, byHost: Map<string, Loc>): void {
  console.log(kleur.bold(file.name) + kleur.dim(`  (${code})`));
  console.log("");
  console.log(`${styleOccupied()} occupied  ${styleEmpty()} empty`);
  console.log("");
  for (const line of renderCluster(file, byHost)) console.log(line);
}

export interface ClusterCmdOpts {
  campus?: string;
}

export async function clusterCmd(
  idArg: string | undefined,
  opts: ClusterCmdOpts,
): Promise<void> {
  try {
    const { slug, id } = await resolveCampus(opts.campus);

    const codes = listClusterNames(slug);
    if (codes.length === 0) {
      printNotFound(slug);
      return;
    }
    const clusters = codes
      .map((code) => ({ code, file: loadClusterFile(slug, code) }))
      .filter((c): c is { code: string; file: ClusterFile } => c.file !== null);

    // Open a specific cluster by code (filename) or friendly name, case-
    // insensitively. Code is checked first, so it wins any collision.
    if (idArg) {
      const match = matchCluster(clusters, idArg);
      if (!match) {
        console.log(kleur.dim(`no cluster "${idArg}" at ${slug}. Available:`));
        for (const c of clusters) console.log(`  ${c.file.name} (${c.code})`);
        return;
      }
      const byHost = await fetchOccupancy(id, slug);
      printClusterMap(match.code, match.file, byHost);
      return;
    }

    // Bare: the index — each cluster's occupancy and how many of your friends
    // are seated there. One occupancy fetch, partitioned across rosters.
    const byHost = await fetchOccupancy(id, slug);
    const friendSet = new Set(loadFriends().friends.map((f) => f.login));
    const rows = clusters.map(({ code, file }) => ({
      label: `${file.name} (${code})`,
      ...summarizeCluster(file, byHost, friendSet),
    }));
    clusterIndexTable(rows);
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
