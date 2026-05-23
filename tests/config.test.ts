import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("config + tokens + friends roundtrip", () => {
  let tmp: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "japonette-test-"));
    origHome = process.env.HOME;
    process.env.HOME = tmp;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = origHome;
    rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  it("saves and loads an app config (just default campus now)", async () => {
    const mod = await import("../src/config.ts");
    mod.saveConfig({ defaultCampusSlug: "paris" });
    const again = mod.loadConfig();
    expect(again.defaultCampusSlug).toBe("paris");
  });

  it("returns null for a missing token file", async () => {
    const mod = await import("../src/config.ts");
    expect(mod.loadToken()).toBeNull();
  });

  it("treats an old-shape token file (no refresh_token) as not logged in", async () => {
    const mod = await import("../src/config.ts");
    // Manually write a token file that's missing refresh_token, as if from an
    // earlier client_credentials build.
    mkdirSync(mod.CONFIG_DIR, { recursive: true });
    writeFileSync(
      mod.TOKEN_FILE,
      JSON.stringify({ access_token: "old", token_type: "bearer", expires_at: 0 }),
    );
    expect(mod.loadToken()).toBeNull();
  });

  it("saves and loads a fresh token with refresh_token", async () => {
    const mod = await import("../src/config.ts");
    mod.saveToken({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
      expires_at: 123,
    });
    const tok = mod.loadToken();
    expect(tok).not.toBeNull();
    expect(tok!.access_token).toBe("a");
    expect(tok!.refresh_token).toBe("r");
    expect(tok!.expires_at).toBe(123);
  });

  it("deletes a token file when present", async () => {
    const mod = await import("../src/config.ts");
    mod.saveToken({
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
      expires_at: 0,
    });
    expect(mod.deleteToken()).toBe(true);
    expect(existsSync(mod.TOKEN_FILE)).toBe(false);
    expect(mod.deleteToken()).toBe(false);
  });

  it("adds and removes a friend", async () => {
    const mod = await import("../src/config.ts");
    const f = mod.loadFriends();
    expect(f.friends).toEqual([]);
    mod.friendsAdd(f, {
      login: "norminette",
      display_name: "Norm",
      added: "2026-05-23",
    });
    mod.saveFriends(f);

    const again = mod.loadFriends();
    expect(mod.friendsHas(again, "norminette")).toBe(true);
    expect(again.friends[0]!.display_name).toBe("Norm");

    expect(mod.friendsRemove(again, "norminette")).toBe(true);
    expect(mod.friendsHas(again, "norminette")).toBe(false);
  });
});
