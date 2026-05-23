import kleur from "kleur";

import { AuthError } from "../auth.js";
import { apiGet, ApiError, paginate } from "../client.js";
import {
  loadCampuses,
  loadConfig,
  saveCampuses,
  saveConfig,
} from "../config.js";
import { campusCard, campusTable, err } from "../render.js";

function slugify(name: string): string {
  return (name || "").toLowerCase().replace(/\s+/g, "-");
}

function findBySlug(list: any[], slug: string): any | undefined {
  const target = slug.toLowerCase();
  return list.find((c) => slugify(c.name) === target);
}

function findById(list: any[], id: number): any | undefined {
  return list.find((c) => Number(c.id) === Number(id));
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
  const match = findBySlug(await loadOrFetchCampuses(), slug);
  return match ? Number(match.id) : null;
}

export async function campusCurrentCmd(): Promise<void> {
  try {
    const cfg = loadConfig();
    const list = await loadOrFetchCampuses();

    if (cfg.defaultCampusSlug) {
      const match = findBySlug(list, cfg.defaultCampusSlug);
      if (!match) {
        err(
          `default campus slug "${cfg.defaultCampusSlug}" no longer matches any campus. Try \`japonette campus set <slug>\` or \`japonette campus list --refresh\`.`,
        );
        process.exit(1);
      }
      campusCard(match, cfg.defaultCampusSlug, true);
      return;
    }

    // No default yet — auto-detect from the logged-in user's primary campus.
    const me = await apiGet<{ campus_users?: any[]; campus?: any[] }>("/v2/me");
    const primary = (me.campus_users ?? []).find((c) => c.is_primary);
    if (!primary) {
      err(
        "no default campus set, and your /v2/me has no primary campus. Try `japonette campus set <slug>`.",
      );
      process.exit(1);
    }

    const match = findById(list, primary.campus_id);
    if (!match) {
      err(
        `could not resolve campus_id=${primary.campus_id} to a campus. Try \`japonette campus list --refresh\`.`,
      );
      process.exit(1);
    }

    const slug = slugify(match.name);
    cfg.defaultCampusSlug = slug;
    saveConfig(cfg);
    console.log(
      kleur.green("✓") +
        " auto-detected your campus from /v2/me: " +
        kleur.cyan(slug),
    );
    campusCard(match, slug, true);
  } catch (e) {
    if (e instanceof ApiError || e instanceof AuthError) {
      err(e.message);
      process.exit(1);
    }
    throw e;
  }
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
