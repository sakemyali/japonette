import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiGet, ApiError } from "../client.js";
import {
  ClusterFile,
  findClusterForHost,
  listClusterNames,
  loadClusterFile,
  renderCluster,
  styleEmpty,
  styleOccupied,
  styleTarget,
} from "../cluster-map.js";
import { err, fmtDuration, fmtTime, withSpinner } from "../render.js";
import { fetchActiveLocations } from "./active.js";
import { resolveCampus } from "./campus.js";

function printHeader(file: ClusterFile, opts: { name: string }): void {
  console.log(kleur.bold(file.name) + kleur.dim(`  (${opts.name})`));
  console.log("");
  console.log(
    styleTarget() +
      " target  " +
      styleOccupied() +
      " occupied  " +
      styleEmpty() +
      " empty",
  );
  console.log("");
}

function printNotFound(slug: string): void {
  console.log(
    kleur.dim(
      `no cluster map yet for "${slug}". Contribute one at https://github.com/sakemyali/japonette/tree/main/clusters`,
    ),
  );
}

export interface ClusterCmdOpts {
  campus?: string;
  name?: string;
  user?: string;
  me?: boolean;
  // commander turns `--no-occupancy` into `occupancy: false`; default true.
  occupancy?: boolean;
}

export async function clusterCmd(opts: ClusterCmdOpts): Promise<void> {
  try {
    // Resolve target user (if any) → that gives us host + cluster auto-pick.
    let targetHost: string | undefined;
    let targetLogin: string | undefined;
    let targetActiveLoc: { begin_at?: string; host?: string; campus_id?: number } | undefined;

    if (opts.me || opts.user) {
      const login = opts.me ? "me" : opts.user!;
      try {
        const userObj = await apiGet<{
          login?: string;
          location?: string | null;
        }>(`/v2/users/${encodeURIComponent(login)}`);
        targetLogin = userObj.login ?? login;
        if (userObj.location) {
          targetHost = userObj.location;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          err(`user not found: ${login}`);
          process.exit(1);
        }
        throw e;
      }
    }

    // Resolve campus. If we have a target host and no --campus, try to find
    // their cluster across all known campuses; else default campus.
    const { slug: campusSlug, id: campusId } = await resolveCampus(opts.campus);

    // Pick the cluster file.
    let clusterName = opts.name;
    let file: ClusterFile | null = null;

    if (clusterName) {
      file = loadClusterFile(campusSlug, clusterName);
    } else if (targetHost) {
      const found = findClusterForHost(campusSlug, targetHost);
      if (found) {
        clusterName = found.name;
        file = found.file;
      }
    }

    if (!file) {
      const names = listClusterNames(campusSlug);
      if (names.length === 0) {
        printNotFound(campusSlug);
        return;
      }
      if (names.length === 1) {
        clusterName = names[0]!;
        file = loadClusterFile(campusSlug, clusterName);
      } else {
        console.log(
          kleur.dim(`${campusSlug} has multiple clusters. Pick one with --name:`),
        );
        for (const n of names) console.log(`  ${n}`);
        return;
      }
    }

    if (!file) {
      printNotFound(campusSlug);
      return;
    }

    // Fetch occupancy (unless --no-occupancy was passed → opts.occupancy === false).
    const activeByHost = new Map<string, { user?: { login?: string }; begin_at?: string }>();
    if (opts.occupancy !== false) {
      const locs = await withSpinner(
        `fetching active users at ${campusSlug}...`,
        () => fetchActiveLocations(campusId, 1000),
      );
      for (const l of locs) {
        if (l.host) activeByHost.set(l.host, l);
      }
      if (targetHost && activeByHost.has(targetHost)) {
        const t = activeByHost.get(targetHost)!;
        targetActiveLoc = { begin_at: t.begin_at, host: targetHost, campus_id: campusId };
      }
    }

    printHeader(file, { name: clusterName! });
    for (const line of renderCluster(file, activeByHost, targetHost)) {
      console.log(line);
    }
    console.log("");

    if (targetLogin) {
      const row = (label: string, value: string): string =>
        `  ${kleur.dim(label.padEnd(7))} ${value}`;
      if (targetHost && file.hosts.includes(targetHost)) {
        console.log(row("user", kleur.cyan(targetLogin)));
        console.log(row("seat", kleur.cyan(targetHost)));
        if (targetActiveLoc?.begin_at) {
          const dur = fmtDuration(targetActiveLoc.begin_at);
          const full = fmtTime(targetActiveLoc.begin_at);
          const since = full === "-" ? "" : `  ${kleur.dim(`(since ${full.slice(11, 16)})`)}`;
          console.log(row("online", `${dur}${since}`));
        }
      } else if (targetHost) {
        console.log(row("user", kleur.cyan(targetLogin)));
        console.log(row("seat", kleur.cyan(targetHost)));
        console.log(row("note", kleur.dim("no cluster map covers this host")));
      } else {
        console.log(row("user", kleur.cyan(targetLogin)));
        console.log(row("status", kleur.dim("not at a workstation")));
      }
    }
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
