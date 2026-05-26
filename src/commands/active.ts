import { AuthError } from "../auth.js";
import { ApiError, paginate } from "../client.js";
import { loadConfig } from "../config.js";
import { activeTable, err, withSpinner } from "../render.js";
import { resolveCampusId } from "./campus.js";

export async function fetchActiveLocations(
  campusId: number,
  limit: number,
): Promise<any[]> {
  const out: any[] = [];
  for await (const loc of paginate<any>(
    `/v2/campus/${campusId}/locations`,
    { "filter[active]": "true", sort: "-begin_at" },
    100,
  )) {
    out.push(loc);
    if (out.length >= limit) break;
  }
  return out;
}

export async function resolveCampus(
  slug: string | undefined,
): Promise<{ slug: string; id: number }> {
  const cfg = loadConfig();
  const chosen = (slug || cfg.defaultCampusSlug || "").trim().toLowerCase();
  if (!chosen) {
    throw new Error(
      "no campus provided and no default set. Try `japonette campus set <slug>`.",
    );
  }
  const id = await resolveCampusId(chosen);
  if (id === null) {
    throw new Error(`unknown campus slug: ${chosen}. Try \`japonette campus list\`.`);
  }
  return { slug: chosen, id };
}

export async function activeCmd(opts: {
  campus?: string;
  limit?: string;
}): Promise<void> {
  const limit = Math.max(1, Number(opts.limit ?? 50));
  try {
    const { slug, id } = await resolveCampus(opts.campus);
    const locs = await withSpinner(
      `fetching active users at ${slug}...`,
      () => fetchActiveLocations(id, limit),
    );
    activeTable(locs, `Active now @ ${slug}`);
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
