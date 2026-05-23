import kleur from "kleur";

import { AuthError } from "../auth.js";
import { ApiError, paginate } from "../client.js";
import {
  loadCampuses,
  loadConfig,
  saveCampuses,
  saveConfig,
} from "../config.js";
import { campusTable, err } from "../render.js";

function slugify(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "-");
}

export async function fetchAllCampuses(): Promise<any[]> {
  const out: any[] = [];
  for await (const c of paginate<any>("/v2/campus", {}, 100)) out.push(c);
  return out;
}

export async function loadOrFetchCampuses(): Promise<any[]> {
  const cached = loadCampuses();
  if (cached) return cached;
  const fresh = await fetchAllCampuses();
  saveCampuses(fresh);
  return fresh;
}

export async function resolveCampusId(slug: string): Promise<number | null> {
  const list = await loadOrFetchCampuses();
  const target = slug.toLowerCase();
  for (const c of list) {
    if (slugify(c.name) === target) return Number(c.id);
  }
  return null;
}

export async function campusListCmd(refresh = false): Promise<void> {
  try {
    let rows: any[];
    if (refresh) {
      rows = await fetchAllCampuses();
      saveCampuses(rows);
    } else {
      rows = await loadOrFetchCampuses();
    }
    rows.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    campusTable(rows);
  } catch (e) {
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
}

export async function campusSetCmd(slug: string): Promise<void> {
  try {
    const id = await resolveCampusId(slug);
    if (id === null) {
      err(`unknown campus slug: ${slug}. Try \`japonette campus list\`.`);
      process.exit(1);
    }
    const cfg = loadConfig();
    cfg.defaultCampusSlug = slug.toLowerCase();
    saveConfig(cfg);
    console.log(
      kleur.green("✓") +
        " default campus set to " +
        kleur.cyan(slug.toLowerCase()),
    );
  } catch (e) {
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
}
