import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiGet, ApiError } from "../client.js";
import { CONFIG_DIR } from "../config.js";
import { err } from "../render.js";
import { fetchActiveLocations, resolveCampus } from "./active.js";

interface ClusterFile {
  name: string;
  campus_slug: string;
  contributed_by?: string;
  notes?: string;
  ascii: string[];
  hosts: string[];
}

const SEAT_TOKEN = /\[·\]/g;

const HERE = dirname(fileURLToPath(import.meta.url));
// dist/commands/cluster.js → up two → package root → clusters/
const BUNDLED_CLUSTERS_DIR = join(HERE, "..", "..", "clusters");
const USER_CLUSTERS_DIR = join(CONFIG_DIR, "clusters");

function lookupDirs(): string[] {
  const env = process.env.JAPONETTE_CLUSTERS_DIR;
  return [
    env ?? "",
    USER_CLUSTERS_DIR,
    BUNDLED_CLUSTERS_DIR,
  ].filter(Boolean);
}

function safeReadDir(dir: string): string[] {
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function listClusterNames(campusSlug: string): string[] {
  const seen = new Set<string>();
  for (const root of lookupDirs()) {
    const slugDir = join(root, campusSlug);
    for (const f of safeReadDir(slugDir)) {
      if (f.endsWith(".json")) seen.add(f.slice(0, -5));
    }
  }
  return [...seen].sort();
}

function loadClusterFile(campusSlug: string, name: string): ClusterFile | null {
  for (const root of lookupDirs()) {
    const path = join(root, campusSlug, `${name}.json`);
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      validateClusterFile(raw, path);
      return raw as ClusterFile;
    } catch (e) {
      err(`failed to read ${path}: ${(e as Error).message}`);
      process.exit(1);
    }
  }
  return null;
}

function validateClusterFile(raw: unknown, path: string): void {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("expected a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.ascii) || !o.ascii.every((l) => typeof l === "string")) {
    throw new Error("`ascii` must be an array of strings");
  }
  if (!Array.isArray(o.hosts) || !o.hosts.every((h) => typeof h === "string")) {
    throw new Error("`hosts` must be an array of strings");
  }
  const seatCount = (o.ascii as string[])
    .join("\n")
    .match(SEAT_TOKEN)?.length ?? 0;
  if (seatCount !== (o.hosts as string[]).length) {
    throw new Error(
      `${path}: ${seatCount} '[·]' seats in ascii but ${(o.hosts as string[]).length} hosts — counts must match`,
    );
  }
}

function findClusterForHost(
  campusSlug: string,
  host: string,
): { name: string; file: ClusterFile } | null {
  for (const name of listClusterNames(campusSlug)) {
    const file = loadClusterFile(campusSlug, name);
    if (file && file.hosts.includes(host)) return { name, file };
  }
  return null;
}

function styleEmpty(): string {
  return kleur.dim("[·]");
}
function styleOccupied(): string {
  return kleur.cyan("[■]");
}
function styleTarget(): string {
  return kleur.red().bold("[X]");
}

function renderCluster(
  file: ClusterFile,
  activeByHost: Map<string, { user?: { login?: string } }>,
  targetHost?: string,
): string[] {
  const status = file.hosts.map((h): "target" | "occupied" | "empty" => {
    if (targetHost && h === targetHost) return "target";
    if (activeByHost.has(h)) return "occupied";
    return "empty";
  });

  let seatIdx = 0;
  return file.ascii.map((line) =>
    line.replace(SEAT_TOKEN, () => {
      const s = status[seatIdx++] ?? "empty";
      if (s === "target") return styleTarget();
      if (s === "occupied") return styleOccupied();
      return styleEmpty();
    }),
  );
}

function fmtDuration(beginISO: string | undefined): string {
  if (!beginISO) return "";
  const begin = new Date(beginISO);
  if (Number.isNaN(begin.getTime())) return "";
  const totalSec = Math.floor((Date.now() - begin.getTime()) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function fmtTime(beginISO: string | undefined): string {
  if (!beginISO) return "";
  const begin = new Date(beginISO);
  if (Number.isNaN(begin.getTime())) return "";
  return begin
    .toLocaleString("sv-SE", { hour12: false })
    .slice(0, 16);
}

function printHeader(file: ClusterFile, opts: { name: string }): void {
  console.log(kleur.bold(file.name) + kleur.dim(`  (${opts.name})`));
  if (file.contributed_by) {
    console.log(kleur.dim(`contributed by ${file.contributed_by}`));
  }
  if (file.notes) console.log(kleur.dim(file.notes));
  console.log("");
  console.log(
    kleur.dim("legend  ") +
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
      const locs = await fetchActiveLocations(campusId, 1000);
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
      if (targetHost && file.hosts.includes(targetHost)) {
        const since = targetActiveLoc?.begin_at
          ? `, since ${fmtTime(targetActiveLoc.begin_at)} (${fmtDuration(targetActiveLoc.begin_at)})`
          : "";
        console.log(
          `  ${kleur.cyan(targetLogin)} → ${kleur.cyan(targetHost)}${since}`,
        );
      } else if (targetHost) {
        console.log(
          kleur.dim(
            `  ${targetLogin} is at ${targetHost}, but no cluster map covers it. Contribute the map!`,
          ),
        );
      } else {
        console.log(
          kleur.dim(`  ${targetLogin} is not at a workstation right now.`),
        );
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

// Exported for tests
export const _internal = {
  renderCluster,
  validateClusterFile,
  SEAT_TOKEN,
  listClusterNames,
  loadClusterFile,
  findClusterForHost,
};
