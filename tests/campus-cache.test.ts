import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the API client so a "live" fetch returns a known directory (Paris +
// Tokyo) without touching the network. The on-disk cache is seeded per test to
// simulate stale / partial state.
vi.mock("../src/client.ts", () => ({
  paginate: async function* () {
    yield { id: 1, name: "Paris" };
    yield { id: 26, name: "Tokyo" };
  },
  apiGet: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

describe("campus directory cache self-heal", () => {
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

  it("refetches when a slug misses a stale cache and finds the new campus", async () => {
    const config = await import("../src/config.ts");
    config.saveCampuses([{ id: 1, name: "Paris" }]); // Tokyo not cached yet
    const { resolveCampusId } = await import("../src/commands/campus.ts");
    expect(await resolveCampusId("tokyo")).toBe(26); // self-healed
  });

  it("returns the cached id on a hit", async () => {
    const config = await import("../src/config.ts");
    config.saveCampuses([
      { id: 1, name: "Paris" },
      { id: 26, name: "Tokyo" },
    ]);
    const { resolveCampusId } = await import("../src/commands/campus.ts");
    expect(await resolveCampusId("paris")).toBe(1);
  });

  it("returns null when even a fresh fetch lacks the slug", async () => {
    const config = await import("../src/config.ts");
    config.saveCampuses([{ id: 1, name: "Paris" }]);
    const { resolveCampusId } = await import("../src/commands/campus.ts");
    expect(await resolveCampusId("atlantis")).toBeNull();
  });

  it("resolveCampus throws unknown-slug after a self-heal refetch still misses", async () => {
    const config = await import("../src/config.ts");
    config.saveCampuses([{ id: 1, name: "Paris" }]);
    const { resolveCampus } = await import("../src/commands/campus.ts");
    await expect(resolveCampus("atlantis")).rejects.toThrow(/unknown campus slug/);
  });

  it("campus list fetches live and refreshes the cache", async () => {
    const config = await import("../src/config.ts");
    config.saveCampuses([{ id: 1, name: "Paris" }]); // stale: missing Tokyo
    const campus = await import("../src/commands/campus.ts");
    await campus.campusListCmd();
    expect(config.loadCampuses()).toHaveLength(2); // Tokyo now present
  });
});
