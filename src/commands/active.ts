import { AuthError } from "../auth.js";
import { ApiError, paginate } from "../client.js";
import { activeTable, err, withSpinner } from "../render.js";
import { resolveCampus } from "./campus.js";

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
