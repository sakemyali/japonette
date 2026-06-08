import { afterEach, describe, expect, it, vi } from "vitest";

import { primaryCampus, userCard } from "../src/render.ts";

const ALICE = {
  login: "alice",
  displayname: "Alice Liddell",
  email: "alice@student.42.fr",
  location: "c1r4s2",
  pool_month: "july",
  pool_year: "2023",
  campus_users: [{ campus_id: 26, is_primary: true }],
  campus: [{ id: 26, name: "Tokyo" }],
  cursus_users: [
    { level: 7.42, cursus: { slug: "42cursus" } },
    { level: 12.3, cursus: { slug: "c-piscine" } },
  ],
};

function capture(fn: () => void): string {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    fn();
    return spy.mock.calls.map((c) => String(c[0])).join("\n");
  } finally {
    spy.mockRestore();
  }
}

describe("userCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("default card is presence-first: identity + status, no profile rows", () => {
    const out = capture(() => userCard(ALICE));
    expect(out).toContain("login");
    expect(out).toContain("alice");
    expect(out).toContain("status");
    expect(out).toContain("online");
    expect(out).toContain("c1r4s2");
    // profile rows are hidden without --info
    expect(out).not.toContain("cursus");
    expect(out).not.toContain("email");
  });

  it("shows offline when there is no location", () => {
    const out = capture(() => userCard({ ...ALICE, location: null }));
    expect(out).toContain("offline");
  });

  it("--info appends the profile rows, campus as a slug not an id", () => {
    const out = capture(() => userCard(ALICE, { info: true }));
    expect(out).toContain("email");
    expect(out).toContain("cursus");
    expect(out).toContain("7.42 (42cursus)");
    expect(out).toContain("piscine");
    expect(out).toContain("campus");
    expect(out).toContain("tokyo"); // slug, not "26"
    expect(out).not.toContain("campus_id");
  });
});

describe("primaryCampus", () => {
  it("resolves id + slug from the embedded campus list", () => {
    expect(primaryCampus(ALICE)).toEqual({ id: 26, slug: "tokyo" });
  });

  it("returns null when there is no campus info", () => {
    expect(primaryCampus({ login: "x" })).toBeNull();
  });
});
