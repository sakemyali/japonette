import { describe, expect, it } from "vitest";

import {
  listClusterNames,
  loadClusterFile,
  renderCluster,
  validateClusterFile,
} from "../src/cluster-map.ts";

// Exercises the extracted primitives against the bundled tokyo maps. Also
// guards the BUNDLED_CLUSTERS_DIR path, which changed depth when the module
// moved out of commands/ — if the "../clusters" resolution were wrong, the
// listing would come back empty.
describe("cluster-map primitives (bundled tokyo maps)", () => {
  it("lists the bundled tokyo clusters", () => {
    const names = listClusterNames("tokyo");
    expect(names).toContain("c1");
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  it("loads a cluster file with matching seat/host counts", () => {
    const file = loadClusterFile("tokyo", "c1");
    expect(file).not.toBeNull();
    const seats = file!.ascii.join("\n").match(/\[·\]/g)?.length ?? 0;
    expect(seats).toBe(file!.hosts.length);
  });

  it("returns null for an unknown cluster", () => {
    expect(loadClusterFile("tokyo", "definitely-not-a-cluster")).toBeNull();
  });

  it("renders occupied and target seats distinctly", () => {
    const file = loadClusterFile("tokyo", "c1")!;
    const occupiedHost = file.hosts[0]!;
    const targetHost = file.hosts[1]!;
    const active = new Map([[occupiedHost, { user: { login: "alice" } }]]);
    const out = renderCluster(file, active, targetHost).join("\n");
    expect(out).toContain("[X]"); // the target seat
    expect(out).toContain("[■]"); // the occupied seat
    expect(out).toContain("[·]"); // empty seats remain
  });

  it("rejects a file whose seat and host counts disagree", () => {
    expect(() => validateClusterFile({ ascii: ["[·]"], hosts: [] }, "x")).toThrow(
      /counts must match/,
    );
  });
});
