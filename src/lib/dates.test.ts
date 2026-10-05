/**
 * Unit tests for the reminder date utilities (task 11.1, design D14).
 *
 * Acceptance criteria:
 *  - Jan 10 + 3 months = Apr 10
 *  - Jan 31 + 1 month = last day of February (28/29)
 *  - The default first due date for an interval reminder is creation + one
 *    interval (member may choose a different first due date instead)
 *  - "today" is computed in HEARTH_TIMEZONE across a time-zone boundary
 */

import { describe, expect, it, afterEach } from "vitest";

import {
  addInterval,
  firstIntervalDueOn,
  todayInZone,
  isLeapYear,
  daysInMonth,
} from "./dates";

describe("addInterval", () => {
  it("Jan 10 + 3 months = Apr 10", () => {
    expect(addInterval("2025-01-10", 3, "month")).toBe("2025-04-10");
  });

  it("Jan 31 + 1 month = last day of February (2025 is not a leap year)", () => {
    expect(addInterval("2025-01-31", 1, "month")).toBe("2025-02-28");
  });

  it("Jan 31 + 1 month in a leap year = Feb 29", () => {
    expect(addInterval("2024-01-31", 1, "month")).toBe("2024-02-29");
  });

  it("Dec 31 + 1 month = Jan 31 (rolls the year)", () => {
    expect(addInterval("2025-12-31", 1, "month")).toBe("2026-01-31");
  });

  it("Feb 29 + 1 year clamps to Feb 28 (leap-day clamp)", () => {
    expect(addInterval("2024-02-29", 1, "year")).toBe("2025-02-28");
  });

  it("adds plain days", () => {
    expect(addInterval("2025-03-01", 1, "day")).toBe("2025-03-02");
  });

  it("adds weeks", () => {
    expect(addInterval("2025-03-01", 2, "week")).toBe("2025-03-15");
  });

  it("adds years", () => {
    expect(addInterval("2025-03-10", 5, "year")).toBe("2030-03-10");
  });

  it("throws for a malformed date", () => {
    expect(() => addInterval("not-a-date", 1, "month")).toThrow();
  });
});

describe("firstIntervalDueOn (default first due date)", () => {
  it("defaults to creation date + one interval", () => {
    expect(firstIntervalDueOn("2025-03-10", 1, "week")).toBe("2025-03-17");
    expect(firstIntervalDueOn("2025-03-10", 1, "month")).toBe("2025-04-10");
    expect(firstIntervalDueOn("2025-03-10", 3, "month")).toBe("2025-06-10");
    expect(firstIntervalDueOn("2025-03-10", 1, "year")).toBe("2026-03-10");
  });

  it("clamps a default first due date that falls on a nonexistent day", () => {
    // Created on Jan 31, monthly → default first due date is Feb 28.
    expect(firstIntervalDueOn("2025-01-31", 1, "month")).toBe("2025-02-28");
  });
});

describe("todayInZone (HEARTH_TIMEZONE)", () => {
  const original = process.env.HEARTH_TIMEZONE;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.HEARTH_TIMEZONE;
    } else {
      process.env.HEARTH_TIMEZONE = original;
    }
  });

  it("defaults to UTC", () => {
    delete process.env.HEARTH_TIMEZONE;
    expect(todayInZone(new Date("2025-03-15T12:00:00Z"))).toBe("2025-03-15");
  });

  it("crosses a time-zone boundary relative to UTC", () => {
    // At 2025-03-15T23:30Z, it is already 2025-03-16 in Tokyo (UTC+9).
    const now = new Date("2025-03-15T23:30:00Z");
    expect(todayInZone(now, "UTC")).toBe("2025-03-15");
    expect(todayInZone(now, "Asia/Tokyo")).toBe("2025-03-16");
    // But it is still 2025-03-15 in Honolulu (UTC-10).
    expect(todayInZone(now, "Pacific/Honolulu")).toBe("2025-03-15");
  });

  it("uses the configured HEARTH_TIMEZONE", () => {
    process.env.HEARTH_TIMEZONE = "Asia/Tokyo";
    const now = new Date("2025-03-15T23:30:00Z");
    expect(todayInZone(now)).toBe("2025-03-16");
  });

  it("handles a boundary just after midnight", () => {
    // 2025-03-15T00:30Z is still 2025-03-14 in Honolulu (UTC-10).
    const now = new Date("2025-03-15T00:30:00Z");
    expect(todayInZone(now, "Pacific/Honolulu")).toBe("2025-03-14");
    expect(todayInZone(now, "UTC")).toBe("2025-03-15");
  });
});

describe("calendar helpers", () => {
  it("isLeapYear", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });

  it("daysInMonth", () => {
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 1)).toBe(31);
  });
});
