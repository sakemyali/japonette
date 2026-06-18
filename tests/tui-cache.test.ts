import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The store pulls in the API client transitively (active/campus commands). The
// cache round-trip is pure I/O, so stub the network so importing store.ts can't
// reach out.
vi.mock("../src/client.ts", () => ({
  apiGet: vi.fn(),
  paginate: async function* () {},
  ApiError: class ApiError extends Error {},
}));

describe("TUI dashboard snapshot cache", () => {
  let tmp: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "japonette-test-"));
    origHome = process.env.HOME;
    process.env.HOME = tmp;
    vi.resetModules();
  });

  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  const sampleStatic = {
    me: { id: 7, login: "ada" },
    campus: { slug: "tokyo", id: 26 },
    friends: new Set<string>(),
    clusters: [],
    scaleTeams: [{ id: 1 }],
    locationsStats: { "2026-06-10": "01:00:00.0" },
  };
  const sampleOcc = {
    active: [{ host: "e1r1p1", user: { login: "grace" } }],
    byHost: new Map(),
  };

  it("returns null when nothing is cached for the slug", async () => {
    const { loadCachedDashboard } = await import("../src/tui/store.ts");
    expect(loadCachedDashboard("tokyo")).toBeNull();
  });

  it("round-trips the network-derived data and rebuilds byHost", async () => {
    const { saveCachedDashboard, loadCachedDashboard } = await import("../src/tui/store.ts");
    saveCachedDashboard(sampleStatic as any, 1000, sampleOcc as any, 2000);

    const got = loadCachedDashboard("tokyo");
    expect(got).not.toBeNull();
    expect(got!.staticAt).toBe(1000);
    expect(got!.occAt).toBe(2000);
    expect(got!.static.me).toEqual({ id: 7, login: "ada" });
    expect(got!.static.scaleTeams).toEqual([{ id: 1 }]);
    // byHost is derived, not stored — rebuilt from the active list on load.
    expect(got!.occ.byHost.get("e1r1p1")).toEqual({ host: "e1r1p1", user: { login: "grace" } });
  });

  it("keeps snapshots separate per campus slug", async () => {
    const { saveCachedDashboard, loadCachedDashboard } = await import("../src/tui/store.ts");
    saveCachedDashboard(sampleStatic as any, 1000, sampleOcc as any, 2000);
    saveCachedDashboard(
      { ...sampleStatic, campus: { slug: "paris", id: 1 } } as any,
      3000,
      { active: [], byHost: new Map() } as any,
      4000,
    );

    expect(loadCachedDashboard("tokyo")!.staticAt).toBe(1000);
    expect(loadCachedDashboard("paris")!.staticAt).toBe(3000);
    expect(loadCachedDashboard("paris")!.occ.active).toEqual([]);
  });
});
