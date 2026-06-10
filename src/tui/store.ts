// The dashboard's data, split by how fast it changes so the refresh loop stays
// gentle on the 42 API (hard limit: 2 req/s, plus an hourly quota).
//
// - STATIC: profile, evaluations, logtime, local friends + cluster maps. Barely
//   changes — fetched once at startup, then only on manual refresh.
// - OCCUPANCY: who's online (paginated). The only thing that moves minute to
//   minute — this is what the steady refresh re-fetches.
import { apiGet } from "../client.js";
import { type ClusterFile, listClusterNames, loadClusterFile } from "../cluster-map.js";
import { fetchActiveLocations } from "../commands/active.js";
import { resolveCampus } from "../commands/campus.js";
import { loadFriends } from "../config.js";
import type { Loc } from "./format.js";

export interface StaticData {
  me: any;
  campus: { slug: string; id: number };
  friends: Set<string>;
  clusters: { code: string; file: ClusterFile }[];
  scaleTeams: any[];
  locationsStats: Record<string, unknown>;
}

export interface Occupancy {
  active: Loc[];
  byHost: Map<string, Loc>;
}

export type DashboardData = StaticData & Occupancy & { fetchedAt: number };

type Phase = (label: string) => void;

// Slow-changing data: one profile call + two soft-failing extras + local files.
// Fetched once; refreshed only on demand.
export async function fetchStatic(campusOpt?: string, onPhase: Phase = () => {}): Promise<StaticData> {
  onPhase("your profile");
  const me = await apiGet<any>("/v2/me");

  onPhase("resolving your campus");
  const campus = await resolveCampus(campusOpt);

  const friends = new Set(loadFriends().friends.map((f) => f.login));
  const clusters = listClusterNames(campus.slug)
    .map((code) => ({ code, file: loadClusterFile(campus.slug, code) }))
    .filter((c): c is { code: string; file: ClusterFile } => c.file !== null);

  onPhase("your evaluations");
  let scaleTeams: any[] = [];
  try {
    scaleTeams = (await apiGet<any[]>("/v2/me/scale_teams", { "page[size]": 100 })) ?? [];
  } catch {
    scaleTeams = [];
  }

  onPhase("your logtime");
  let locationsStats: Record<string, unknown> = {};
  try {
    locationsStats =
      (await apiGet<Record<string, unknown>>(`/v2/users/${me.id}/locations_stats`)) ?? {};
  } catch {
    locationsStats = {};
  }

  return { me, campus, friends, clusters, scaleTeams, locationsStats };
}

// Fast-changing data: who's at the campus right now (paginated; this is the
// expensive call). Re-fetched by the steady refresh loop.
export async function fetchOccupancy(campus: { slug: string; id: number }, onPhase: Phase = () => {}): Promise<Occupancy> {
  onPhase(`who's online @ ${campus.slug}`);
  const active = (await fetchActiveLocations(campus.id, 1000)) as Loc[];
  const byHost = new Map<string, Loc>();
  for (const l of active) if (l.host) byHost.set(l.host, l);
  return { active, byHost };
}
