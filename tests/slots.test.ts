import { describe, expect, it } from "vitest";

import {
  groupSlots,
  inScaleTeamRole,
  parseSlotArgs,
  parseSlotRange,
  pickOpenWindow,
  type RawSlot,
  type SlotWindow,
} from "../src/slots.ts";

describe("parseSlotRange", () => {
  const now = new Date(2026, 5, 9, 10, 0, 0); // 2026-06-09 10:00 local

  it("parses an explicit date + range into a local interval", () => {
    const { begin, end } = parseSlotRange("2026-06-10", "14:00-16:00", now);
    expect(begin.getFullYear()).toBe(2026);
    expect(begin.getMonth()).toBe(5);
    expect(begin.getDate()).toBe(10);
    expect(begin.getHours()).toBe(14);
    expect(end.getHours()).toBe(16);
  });

  it("resolves today and tomorrow relative to now", () => {
    expect(parseSlotRange("today", "09:00-10:00", now).begin.getDate()).toBe(9);
    expect(parseSlotRange("tomorrow", "09:00-10:00", now).begin.getDate()).toBe(10);
  });

  it("accepts whole-hour shorthand (14-16)", () => {
    const { begin, end } = parseSlotRange("today", "14-16", now);
    expect(begin.getHours()).toBe(14);
    expect(begin.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(16);
    expect(end.getMinutes()).toBe(0);
  });

  it("accepts an en-dash separator", () => {
    const { end } = parseSlotRange("today", "09:00–11:30", now);
    expect(end.getHours()).toBe(11);
    expect(end.getMinutes()).toBe(30);
  });

  it("rejects a malformed day", () => {
    expect(() => parseSlotRange("someday", "09:00-10:00", now)).toThrow(/bad day/);
  });

  it("rejects a malformed range", () => {
    expect(() => parseSlotRange("today", "9am-11am", now)).toThrow(/bad range/);
  });

  it("rejects a non-positive span", () => {
    expect(() => parseSlotRange("today", "16:00-14:00", now)).toThrow(/after start/);
  });

  it("rejects out-of-range clock values instead of rolling over", () => {
    expect(() => parseSlotRange("today", "24:00-25:00", now)).toThrow(/bad range/);
    expect(() => parseSlotRange("today", "10:60-11:00", now)).toThrow(/bad range/);
  });

  it("rejects an impossible calendar date instead of rolling over", () => {
    expect(() => parseSlotRange("2026-02-31", "09:00-10:00", now)).toThrow(/not a real date/);
    expect(() => parseSlotRange("2026-13-01", "09:00-10:00", now)).toThrow(/not a real date/);
  });
});

describe("parseSlotArgs", () => {
  const now = new Date(2026, 5, 15, 10, 0, 0); // 2026-06-15 10:00 local

  it("start + duration (day defaults today)", () => {
    const { begin, end } = parseSlotArgs(["14", "1h"], now);
    expect(begin.getDate()).toBe(15);
    expect(begin.getHours()).toBe(14);
    expect(end.getHours()).toBe(15);
  });

  it("day + start + duration", () => {
    const { begin, end } = parseSlotArgs(["tomorrow", "9", "90m"], now);
    expect(begin.getDate()).toBe(16);
    expect(begin.getHours()).toBe(9);
    expect(end.getHours()).toBe(10);
    expect(end.getMinutes()).toBe(30);
  });

  it("weekday resolves to its day-of-week, am/pm parsed", () => {
    const { begin } = parseSlotArgs(["fri", "2pm", "1h"], now);
    expect(begin.getDay()).toBe(5);
    expect(begin.getHours()).toBe(14);
  });

  it("`soon` = now+30m snapped up to the 15-min grid", () => {
    const { begin, end } = parseSlotArgs(["soon", "1h"], now);
    expect(begin.getTime()).toBeGreaterThanOrEqual(now.getTime() + 30 * 60_000);
    expect(begin.getMinutes() % 15).toBe(0);
    expect(end.getTime() - begin.getTime()).toBe(60 * 60_000);
  });

  it("relative `+45m` start counts from now", () => {
    const { begin } = parseSlotArgs(["+45m", "1h"], now);
    expect(begin.getHours()).toBe(10);
    expect(begin.getMinutes()).toBe(45);
  });

  it("still accepts the range form, with or without a day", () => {
    expect(parseSlotArgs(["14-16"], now).begin.getHours()).toBe(14);
    expect(parseSlotArgs(["today", "14:00-16:00"], now).end.getHours()).toBe(16);
  });

  it("rejects junk and missing pieces", () => {
    expect(() => parseSlotArgs([], now)).toThrow(/usage/);
    expect(() => parseSlotArgs(["soon"], now)).toThrow(/duration/);
    expect(() => parseSlotArgs(["banana", "1h"], now)).toThrow(/bad time/);
    expect(() => parseSlotArgs(["14", "0h"], now)).toThrow(/duration/);
  });
});

describe("pickOpenWindow", () => {
  const win = (begin: string, booked = false): SlotWindow => ({
    begin,
    end: begin,
    ids: [1],
    booked,
  });
  // open, booked, open — numbering must skip the booked one.
  const windows = [win("a"), win("b", true), win("c")];

  it("numbers open windows only (1-based), skipping booked", () => {
    expect(pickOpenWindow(windows, 1)?.begin).toBe("a");
    expect(pickOpenWindow(windows, 2)?.begin).toBe("c");
  });
  it("returns null out of range or for non-integers", () => {
    expect(pickOpenWindow(windows, 3)).toBeNull(); // only 2 open
    expect(pickOpenWindow(windows, 0)).toBeNull();
    expect(pickOpenWindow(windows, NaN)).toBeNull();
  });
});

describe("inScaleTeamRole", () => {
  const team = { corrector: { id: 7 }, correcteds: [{ id: 9 }, { id: 11 }] };
  it("giving = you're the corrector", () => {
    expect(inScaleTeamRole(team, 7, "giving")).toBe(true);
    expect(inScaleTeamRole(team, 9, "giving")).toBe(false);
  });
  it("receiving = you're among the correcteds", () => {
    expect(inScaleTeamRole(team, 9, "receiving")).toBe(true);
    expect(inScaleTeamRole(team, 7, "receiving")).toBe(false);
  });
});

describe("groupSlots", () => {
  const slot = (id: number, begin: string, end: string, scale_team?: unknown): RawSlot => ({
    id,
    begin_at: begin,
    end_at: end,
    scale_team,
  });

  it("merges contiguous open slots into one window with all ids", () => {
    const out = groupSlots([
      slot(1, "2026-06-10T14:00:00Z", "2026-06-10T14:15:00Z"),
      slot(2, "2026-06-10T14:15:00Z", "2026-06-10T14:30:00Z"),
      slot(3, "2026-06-10T14:30:00Z", "2026-06-10T14:45:00Z"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      begin: "2026-06-10T14:00:00Z",
      end: "2026-06-10T14:45:00Z",
      ids: [1, 2, 3],
      booked: false,
    });
  });

  it("merges across differing ISO formats for the same instant", () => {
    const out = groupSlots([
      slot(1, "2026-06-10T14:00:00Z", "2026-06-10T14:15:00.000Z"),
      slot(2, "2026-06-10T14:15:00Z", "2026-06-10T14:30:00Z"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.ids).toEqual([1, 2]);
  });

  it("keeps a gap between non-contiguous open slots", () => {
    const out = groupSlots([
      slot(1, "2026-06-10T14:00:00Z", "2026-06-10T14:15:00Z"),
      slot(2, "2026-06-10T16:00:00Z", "2026-06-10T16:15:00Z"),
    ]);
    expect(out).toHaveLength(2);
  });

  it("never merges a booked slot, and names who took it", () => {
    const out = groupSlots([
      slot(1, "2026-06-10T14:00:00Z", "2026-06-10T14:15:00Z"),
      slot(2, "2026-06-10T14:15:00Z", "2026-06-10T14:30:00Z", {
        correcteds: [{ login: "alice" }],
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ booked: true, bookedBy: "alice", ids: [2] });
  });

  it("sorts out-of-order input before grouping", () => {
    const out = groupSlots([
      slot(2, "2026-06-10T14:15:00Z", "2026-06-10T14:30:00Z"),
      slot(1, "2026-06-10T14:00:00Z", "2026-06-10T14:15:00Z"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].ids).toEqual([1, 2]);
  });
});
