import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Verifies the single campus resolver's precedence:
//   explicit --campus flag  >  $JAPONETTE_CAMPUS  >  saved default.
// The campus directory is seeded into the on-disk cache so resolution never
// touches the network.
describe("resolveCampus precedence (flag > env > default)", () => {
  let tmp: string;
  let origHome: string | undefined;
  let origEnvCampus: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "japonette-test-"));
    origHome = process.env.HOME;
    origEnvCampus = process.env.JAPONETTE_CAMPUS;
    process.env.HOME = tmp;
    delete process.env.JAPONETTE_CAMPUS;
    vi.resetModules();
  });

  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    if (origEnvCampus === undefined) delete process.env.JAPONETTE_CAMPUS;
    else process.env.JAPONETTE_CAMPUS = origEnvCampus;
    rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  async function seedDirectory(): Promise<void> {
    const config = await import("../src/config.ts");
    config.saveCampuses([
      { id: 1, name: "Paris" },
      { id: 26, name: "Tokyo" },
      { id: 29, name: "Seoul" },
    ]);
    config.saveConfig({ defaultCampusSlug: "paris" });
  }

  it("falls back to the saved default when no flag or env is given", async () => {
    await seedDirectory();
    const { resolveCampus } = await import("../src/commands/campus.ts");
    expect(await resolveCampus(undefined)).toEqual({ slug: "paris", id: 1 });
  });

  it("prefers $JAPONETTE_CAMPUS over the saved default", async () => {
    await seedDirectory();
    process.env.JAPONETTE_CAMPUS = "tokyo";
    const { resolveCampus } = await import("../src/commands/campus.ts");
    expect(await resolveCampus(undefined)).toEqual({ slug: "tokyo", id: 26 });
  });

  it("prefers an explicit flag over both env and default", async () => {
    await seedDirectory();
    process.env.JAPONETTE_CAMPUS = "tokyo";
    const { resolveCampus } = await import("../src/commands/campus.ts");
    expect(await resolveCampus("seoul")).toEqual({ slug: "seoul", id: 29 });
  });

  it("treats a whitespace-only flag as not provided and falls through", async () => {
    await seedDirectory();
    process.env.JAPONETTE_CAMPUS = "tokyo";
    const { resolveCampus } = await import("../src/commands/campus.ts");
    expect(await resolveCampus("   ")).toEqual({ slug: "tokyo", id: 26 });
  });

  it("treats a whitespace-only env var as not provided and uses the default", async () => {
    await seedDirectory();
    process.env.JAPONETTE_CAMPUS = "   ";
    const { resolveCampus } = await import("../src/commands/campus.ts");
    expect(await resolveCampus(undefined)).toEqual({ slug: "paris", id: 1 });
  });

  it("throws when nothing resolves a campus", async () => {
    const config = await import("../src/config.ts");
    config.saveCampuses([{ id: 1, name: "Paris" }]);
    const { resolveCampus } = await import("../src/commands/campus.ts");
    await expect(resolveCampus(undefined)).rejects.toThrow(/no campus provided/);
  });

  // Note: the unknown-slug case now triggers a self-heal refetch, so it's
  // covered in campus-cache.test.ts (which mocks the network) rather than here.
});
