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
import { fetchLocationsSince } from "../commands/logtime.js";
import { loadFriends, loadTuiSnapshot, saveTuiSnapshot } from "../config.js";
import { bucketDailySeconds, type Loc } from "./format.js";

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

// The cheap, local-only parts of StaticData: the friends watchlist and the
// bundled cluster-map files. No network — re-derived fresh on every load (and
// on cache hydration) so the persisted snapshot only carries network data.
function localParts(campusSlug: string): Pick<StaticData, "friends" | "clusters"> {
  const friends = new Set(loadFriends().friends.map((f) => f.login));
  const clusters = listClusterNames(campusSlug)
    .map((code) => ({ code, file: loadClusterFile(campusSlug, code) }))
    .filter((c): c is { code: string; file: ClusterFile } => c.file !== null);
  return { friends, clusters };
}

// Rebuild an Occupancy (the host→location index is derived, not stored) from a
// flat list of active locations.
function toOccupancy(active: Loc[]): Occupancy {
  const byHost = new Map<string, Loc>();
  for (const l of active) if (l.host) byHost.set(l.host, l);
  return { active, byHost };
}

// Slow-changing data: one profile call + two soft-failing extras + local files.
// Fetched once; refreshed only on demand.
export async function fetchStatic(campusOpt?: string, onPhase: Phase = () => {}): Promise<StaticData> {
  onPhase("your profile");
  const me = await apiGet<any>("/v2/me");

  onPhase("resolving your campus");
  const campus = await resolveCampus(campusOpt);

  const { friends, clusters } = localParts(campus.slug);

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
    // /v2/users/:id/locations_stats 403s for plain tokens, so rebuild the same
    // day→seconds map from raw sessions. 45 days covers the popup's 6-week
    // comparison; pagination bails at the boundary, so it's ~one request.
    const from = new Date(Date.now() - 45 * 86_400_000);
    locationsStats = bucketDailySeconds(await fetchLocationsSince(me.id, from));
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
  return toOccupancy(active);
}

// ---- persistent cache ---------------------------------------------------
// On relaunch the dashboard re-fetches everything, which is slow and burns the
// request budget. Persisting a snapshot lets a relaunch hydrate instantly and
// re-fetch only the parts that have aged past their refresh window.

export interface CachedDashboard {
  static: StaticData;
  staticAt: number;
  occ: Occupancy;
  occAt: number;
}

// Hydrate a previously persisted snapshot for a campus slug, re-deriving the
// cheap local-only parts. Returns null when nothing is cached for that slug.
export function loadCachedDashboard(campusSlug: string): CachedDashboard | null {
  const snap = loadTuiSnapshot(campusSlug);
  if (!snap) return null;
  const { friends, clusters } = localParts(campusSlug);
  return {
    static: {
      me: snap.me,
      campus: snap.campus,
      friends,
      clusters,
      scaleTeams: snap.scaleTeams,
      locationsStats: snap.locationsStats,
    },
    staticAt: snap.staticAt,
    occ: toOccupancy(snap.active as Loc[]),
    occAt: snap.occAt,
  };
}

// Persist the network-derived parts of the current dashboard, each tagged with
// when it was fetched so the next launch can judge staleness per-section.
export function saveCachedDashboard(
  staticData: StaticData,
  staticAt: number,
  occ: Occupancy,
  occAt: number,
): void {
  saveTuiSnapshot(staticData.campus.slug, {
    staticAt,
    me: staticData.me,
    campus: staticData.campus,
    scaleTeams: staticData.scaleTeams,
    locationsStats: staticData.locationsStats,
    occAt,
    active: occ.active,
  });
}
