// The dashboard's shared data: one pooled fetch per refresh that every widget
// reads from, so N widgets don't make N redundant API calls. Read-only.
import { apiGet } from "../client.js";
import { type ClusterFile, listClusterNames, loadClusterFile } from "../cluster-map.js";
import { fetchActiveLocations } from "../commands/active.js";
import { resolveCampus } from "../commands/campus.js";
import { loadFriends } from "../config.js";
import type { Loc } from "./format.js";

export interface DashboardData {
  me: any;
  campus: { slug: string; id: number };
  byHost: Map<string, Loc>;
  active: Loc[];
  friends: Set<string>;
  clusters: { code: string; file: ClusterFile }[];
  scaleTeams: any[];
  locationsStats: Record<string, unknown>;
  fetchedAt: number;
}

// Pull everything the default widgets need. The 42-side calls (me, occupancy,
// scale_teams, locations_stats) run here once; widgets just project from the
// result. Soft-fail the optional calls so a missing scope/endpoint doesn't sink
// the whole dashboard.
export async function fetchDashboard(campusOpt?: string): Promise<DashboardData> {
  const me = await apiGet<any>("/v2/me");
  const campus = await resolveCampus(campusOpt);

  const active = (await fetchActiveLocations(campus.id, 1000)) as Loc[];
  const byHost = new Map<string, Loc>();
  for (const l of active) if (l.host) byHost.set(l.host, l);

  const friends = new Set(loadFriends().friends.map((f) => f.login));

  const clusters = listClusterNames(campus.slug)
    .map((code) => ({ code, file: loadClusterFile(campus.slug, code) }))
    .filter((c): c is { code: string; file: ClusterFile } => c.file !== null);

  let scaleTeams: any[] = [];
  try {
    scaleTeams = (await apiGet<any[]>("/v2/me/scale_teams", { "page[size]": 100 })) ?? [];
  } catch {
    scaleTeams = [];
  }

  let locationsStats: Record<string, unknown> = {};
  try {
    locationsStats =
      (await apiGet<Record<string, unknown>>(`/v2/users/${me.id}/locations_stats`)) ?? {};
  } catch {
    locationsStats = {};
  }

  return {
    me,
    campus,
    byHost,
    active,
    friends,
    clusters,
    scaleTeams,
    locationsStats,
    fetchedAt: Date.now(),
  };
}
