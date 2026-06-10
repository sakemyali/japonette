import { describe, expect, it } from "vitest";

import {
  blackholeDays,
  bucketDailySeconds,
  clusterRoster,
  computeStreak,
  durationToSeconds,
  liveSessionSeconds,
  type Loc,
  logtimeSeconds,
  monthToDateSeconds,
  soonScaleTeams,
  stepCarousel,
  weeklyTotals,
  ymd,
} from "../src/tui/format.ts";

describe("blackholeDays", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0);
  it("ceils days remaining", () => {
    expect(blackholeDays(new Date(2026, 5, 19, 12, 0, 0).toISOString(), now)).toBe(10);
  });
  it("returns null when absent", () => {
    expect(blackholeDays(null, now)).toBeNull();
    expect(blackholeDays(undefined, now)).toBeNull();
  });
});

describe("durationToSeconds", () => {
  it("parses HH:MM:SS", () => {
    expect(durationToSeconds("12:34:56.789")).toBe(12 * 3600 + 34 * 60 + 56);
  });
  it("accepts a number", () => {
    expect(durationToSeconds(90)).toBe(90);
  });
  it("falls back to 0 on junk", () => {
    expect(durationToSeconds("nope")).toBe(0);
    expect(durationToSeconds(undefined)).toBe(0);
  });
});

describe("computeStreak", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0); // 2026-06-09
  it("counts consecutive logged days ending today", () => {
    const stats = {
      "2026-06-09": "01:00:00",
      "2026-06-08": "02:00:00",
      "2026-06-07": "00:30:00",
    };
    expect(computeStreak(stats, now)).toBe(3);
  });
  it("still counts from yesterday when today isn't logged yet", () => {
    const stats = { "2026-06-08": "02:00:00", "2026-06-07": "01:00:00" };
    expect(computeStreak(stats, now)).toBe(2);
  });
  it("breaks on a gap", () => {
    const stats = { "2026-06-09": "01:00:00", "2026-06-07": "01:00:00" };
    expect(computeStreak(stats, now)).toBe(1);
  });
  it("is 0 when nothing recent", () => {
    expect(computeStreak({ "2026-01-01": "05:00:00" }, now)).toBe(0);
  });
  it("a live session counts today as logged", () => {
    const stats = { "2026-06-08": "02:00:00" }; // today absent (still seated)
    expect(computeStreak(stats, now, 1800)).toBe(2);
    expect(computeStreak({}, now, 1800)).toBe(1);
  });
});

describe("weeklyTotals", () => {
  const now = new Date(2026, 5, 10, 12); // wed 2026-06-10
  it("buckets calendar weeks (mon-start), oldest first", () => {
    const stats = {
      "2026-06-09": 3600, // this week (mon jun 08)
      "2026-06-08": 1800, // this week
      "2026-06-07": 7200, // sunday → week of jun 01
      "2026-05-31": 600, // sunday → week of may 25
    };
    const w = weeklyTotals(stats, 3, now);
    expect(w.map((x) => ymd(x.start))).toEqual(["2026-05-25", "2026-06-01", "2026-06-08"]);
    expect(w.map((x) => x.secs)).toEqual([600, 7200, 5400]);
  });
});

describe("monthToDateSeconds", () => {
  it("sums only the current calendar month", () => {
    const now = new Date(2026, 5, 10);
    expect(monthToDateSeconds({ "2026-06-09": 3600, "2026-05-31": 9999 }, now)).toBe(3600);
  });
});

describe("bucketDailySeconds", () => {
  // Build ISO strings from local components so the expected day keys (local
  // time) hold in any timezone the tests run in.
  const iso = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m).toISOString();
  it("sums completed sessions per local day", () => {
    const locs = [
      { begin_at: iso(9, 10, 0), end_at: iso(9, 11, 24) },
      { begin_at: iso(9, 13, 0), end_at: iso(9, 13, 45) },
    ];
    expect(bucketDailySeconds(locs)).toEqual({ "2026-06-09": (84 + 45) * 60 });
  });
  it("splits a session crossing midnight across both days", () => {
    const locs = [{ begin_at: iso(9, 23, 0), end_at: iso(10, 1, 0) }];
    expect(bucketDailySeconds(locs)).toEqual({ "2026-06-09": 3600, "2026-06-10": 3600 });
  });
  it("skips ongoing and malformed sessions", () => {
    expect(
      bucketDailySeconds([
        { begin_at: iso(9, 10, 0), end_at: null }, // still seated
        { begin_at: "junk", end_at: iso(9, 11, 0) },
        { begin_at: iso(9, 12, 0), end_at: iso(9, 11, 0) }, // end before begin
      ]),
    ).toEqual({});
  });
});

describe("liveSessionSeconds", () => {
  const now = new Date("2026-06-09T12:00:00Z");
  const active: Loc[] = [
    { host: "c1r1p1", user: { login: "ada" }, begin_at: "2026-06-09T10:00:00Z" },
    { host: "c1r1p2", user: { login: "grace" }, begin_at: "2026-06-09T11:30:00Z" },
  ];
  it("returns seconds since my begin_at", () => {
    expect(liveSessionSeconds(active, "ada", now)).toBe(2 * 3600);
  });
  it("is 0 when I'm not online", () => {
    expect(liveSessionSeconds(active, "linus", now)).toBe(0);
    expect(liveSessionSeconds([], "ada", now)).toBe(0);
    expect(liveSessionSeconds(active, undefined, now)).toBe(0);
  });
});

describe("logtimeSeconds", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0);
  it("sums the last N days inclusive of today", () => {
    const stats = {
      "2026-06-09": "01:00:00",
      "2026-06-08": "02:00:00",
      "2026-06-01": "10:00:00", // outside a 7-day window
    };
    expect(logtimeSeconds(stats, 7, now)).toBe(3 * 3600);
  });
});

describe("clusterRoster", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0);
  const byHost = new Map<string, Loc>([
    ["c1r1p1", { host: "c1r1p1", user: { login: "alice" }, begin_at: new Date(2026, 5, 9, 11, 0, 0).toISOString() }],
    ["c1r1p2", { host: "c1r1p2", user: { login: "bob" }, begin_at: new Date(2026, 5, 9, 10, 0, 0).toISOString() }],
  ]);
  it("lists seated people, friends first then longest session", () => {
    const roster = clusterRoster(["c1r1p1", "c1r1p2", "c1r1p3"], byHost, new Set(["bob"]), now);
    expect(roster.map((r) => r.login)).toEqual(["bob", "alice"]); // bob is a friend
    expect(roster[0]?.isFriend).toBe(true);
  });
  it("skips empty hosts", () => {
    const roster = clusterRoster(["c1r1p3"], byHost, new Set(), now);
    expect(roster).toHaveLength(0);
  });
});

describe("stepCarousel", () => {
  it("wraps forward and back", () => {
    expect(stepCarousel(2, 3, 1)).toBe(0);
    expect(stepCarousel(0, 3, -1)).toBe(2);
  });
  it("skips empties when asked", () => {
    // indexes 1 and 2 empty → from 0 forward lands back on 0
    expect(stepCarousel(0, 3, 1, (i) => i !== 0)).toBe(0);
    // index 1 empty, 2 not → from 0 forward skips to 2
    expect(stepCarousel(0, 3, 1, (i) => i === 1)).toBe(2);
  });
  it("handles empty list", () => {
    expect(stepCarousel(0, 0, 1)).toBe(0);
  });
});

describe("soonScaleTeams", () => {
  const now = new Date(2026, 5, 9, 12, 0, 0);
  const at = (h: number) => new Date(2026, 5, 9, 12 + h, 0, 0).toISOString();
  it("keeps upcoming-in-window, sorts, caps", () => {
    const teams = [
      { begin_at: at(2), team: { name: "ft_printf" } },
      { begin_at: at(1), team: { name: "minishell" } },
      { begin_at: at(48), team: { name: "too_far" } },
    ];
    const out = soonScaleTeams(teams, now, 24, 5);
    expect(out.map((i) => i.label)).toEqual(["minishell", "ft_printf"]);
  });
  it("falls back to correcteds for the label", () => {
    const out = soonScaleTeams([{ begin_at: at(1), correcteds: [{ login: "ann" }] }], now);
    expect(out[0]?.label).toBe("ann");
  });
});
