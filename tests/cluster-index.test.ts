import { afterEach, describe, expect, it, vi } from "vitest";

import { matchCluster, summarizeCluster } from "../src/commands/cluster.ts";
import { clusterIndexTable } from "../src/render.ts";
import type { ClusterFile } from "../src/cluster-map.ts";

const sakura: ClusterFile = {
  name: "Sakura",
  campus_slug: "tokyo",
  ascii: [],
  hosts: ["c5r1s1", "c5r1s2", "c5r1s3"],
};
const hanami: ClusterFile = {
  name: "Hanami",
  campus_slug: "tokyo",
  ascii: [],
  hosts: ["c1r1s1", "c1r1s2"],
};
const clusters = [
  { code: "c5", file: sakura },
  { code: "c1", file: hanami },
];

describe("matchCluster", () => {
  it("matches by code, case-insensitively", () => {
    expect(matchCluster(clusters, "c5")?.file.name).toBe("Sakura");
    expect(matchCluster(clusters, "C5")?.file.name).toBe("Sakura");
  });

  it("matches by friendly name, case-insensitively", () => {
    expect(matchCluster(clusters, "Sakura")?.code).toBe("c5");
    expect(matchCluster(clusters, "sakura")?.code).toBe("c5");
  });

  it("returns null for an unknown id", () => {
    expect(matchCluster(clusters, "nope")).toBeNull();
  });
});

describe("summarizeCluster", () => {
  it("counts occupied seats and friends among them", () => {
    const byHost = new Map<string, { user?: { login?: string } }>([
      ["c5r1s1", { user: { login: "alice" } }], // friend
      ["c5r1s2", { user: { login: "stranger" } }], // not a friend
      // c5r1s3 empty
    ]);
    const friends = new Set(["alice", "bob"]);
    expect(summarizeCluster(sakura, byHost, friends)).toEqual({
      occupied: 2,
      total: 3,
      friends: 1,
    });
  });

  it("is all-empty when nobody is seated", () => {
    expect(summarizeCluster(hanami, new Map(), new Set())).toEqual({
      occupied: 0,
      total: 2,
      friends: 0,
    });
  });
});

describe("clusterIndexTable", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders label, x/y, and singular/plural friend counts", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    clusterIndexTable([
      { label: "Sakura (c5)", occupied: 34, total: 56, friends: 2 },
      { label: "Hanami (c1)", occupied: 51, total: 56, friends: 0 },
      { label: "Komorebi (c2)", occupied: 8, total: 40, friends: 1 },
    ]);
    const out = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toContain("Sakura (c5)");
    expect(out).toContain("34/56");
    expect(out).toContain("2 friends");
    expect(out).toContain("0 friends");
    expect(out).toContain("1 friend"); // singular
  });
});
