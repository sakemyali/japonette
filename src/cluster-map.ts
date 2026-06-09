// Cluster map primitives: loading contributed JSON layouts and rendering them
// to ASCII with live occupancy. Extracted from the `cluster` command so other
// surfaces (the `user` presence card, and later the TUI) can draw the same map
// without depending on the command. No command-specific I/O lives here.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import kleur from "kleur";

import { CONFIG_DIR } from "./config.js";
import { err } from "./render.js";

export interface ClusterFile {
  name: string;
  campus_slug: string;
  contributed_by?: string;
  notes?: string;
  ascii: string[];
  hosts: string[];
}

export const SEAT_TOKEN = /\[·\]/g;

const HERE = dirname(fileURLToPath(import.meta.url));
// src/cluster-map.ts → dist/cluster-map.js; up one → package root → clusters/.
const BUNDLED_CLUSTERS_DIR = join(HERE, "..", "clusters");
const USER_CLUSTERS_DIR = join(CONFIG_DIR, "clusters");

function lookupDirs(): string[] {
  const env = process.env.JAPONETTE_CLUSTERS_DIR;
  return [env ?? "", USER_CLUSTERS_DIR, BUNDLED_CLUSTERS_DIR].filter(Boolean);
}

function safeReadDir(dir: string): string[] {
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function listClusterNames(campusSlug: string): string[] {
  const seen = new Set<string>();
  for (const root of lookupDirs()) {
    const slugDir = join(root, campusSlug);
    for (const f of safeReadDir(slugDir)) {
      if (f.endsWith(".json")) seen.add(f.slice(0, -5));
    }
  }
  return [...seen].sort();
}

export function loadClusterFile(campusSlug: string, name: string): ClusterFile | null {
  for (const root of lookupDirs()) {
    const path = join(root, campusSlug, `${name}.json`);
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      validateClusterFile(raw, path);
      return raw as ClusterFile;
    } catch (e) {
      throw new Error(`failed to read ${path}: ${(e as Error).message}`);
    }
  }
  return null;
}

export function validateClusterFile(raw: unknown, path: string): void {
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
  const seatCount = (o.ascii as string[]).join("\n").match(SEAT_TOKEN)?.length ?? 0;
  if (seatCount !== (o.hosts as string[]).length) {
    throw new Error(
      `${path}: ${seatCount} '[·]' seats in ascii but ${(o.hosts as string[]).length} hosts — counts must match`,
    );
  }
}

export function findClusterForHost(
  campusSlug: string,
  host: string,
): { name: string; file: ClusterFile } | null {
  for (const name of listClusterNames(campusSlug)) {
    const file = loadClusterFile(campusSlug, name);
    if (file && file.hosts.includes(host)) return { name, file };
  }
  return null;
}

export function styleEmpty(): string {
  return kleur.dim("[·]");
}
export function styleOccupied(): string {
  return kleur.cyan("[■]");
}
export function styleTarget(): string {
  return kleur.red().bold("[X]");
}

export function renderCluster(
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
