import { describe, expect, it } from "vitest";
import {
  addReminderInterval,
  formatReminderInterval,
  hasReminderInterval,
  isDueForReminder,
  isStale,
  type ReminderIntervalState,
} from "@/lib/reminders/interval";

function makeIntervalState(overrides: Partial<ReminderIntervalState> = {}): ReminderIntervalState {
  return {
    reminderIntervalCount: 7,
    reminderIntervalUnit: "day",
    lastReminderAt: null,
    ...overrides,
  };
}

describe("addReminderInterval", () => {
  it("adds days", () => {
    const start = new Date("2026-01-15T12:00:00Z");
    const result = addReminderInterval(start, 7, "day");
    expect(result.toISOString()).toBe("2026-01-22T12:00:00.000Z");
  });

  it("adds weeks", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const result = addReminderInterval(start, 2, "week");
    expect(result.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("adds months across month boundaries", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    const result = addReminderInterval(start, 1, "month");
    expect(result.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("adds years", () => {
    const start = new Date("2024-06-15T00:00:00Z");
    const result = addReminderInterval(start, 1, "year");
    expect(result.toISOString()).toBe("2025-06-15T00:00:00.000Z");
  });
});

describe("isStale", () => {
  it("returns false when reminders are disabled", () => {
    const state = makeIntervalState({ reminderIntervalCount: null, reminderIntervalUnit: null });
    expect(isStale(state, new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("flags past the interval since anchor", () => {
    const state = makeIntervalState({ reminderIntervalCount: 7, reminderIntervalUnit: "day" });
    expect(isStale(state, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-20T00:00:00Z"))).toBe(
      true,
    );
  });

  it("does not flag before the interval elapses", () => {
    const state = makeIntervalState({ reminderIntervalCount: 7, reminderIntervalUnit: "day" });
    expect(isStale(state, new Date("2026-06-10T00:00:00Z"), new Date("2026-06-12T00:00:00Z"))).toBe(
      false,
    );
  });
});

describe("isDueForReminder", () => {
  it("is due on first stale check when no reminder has been sent", () => {
    const state = makeIntervalState({ lastReminderAt: null });
    expect(
      isDueForReminder(state, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-20T00:00:00Z")),
    ).toBe(true);
  });

  it("waits for the retry interval after the last reminder", () => {
    const state = makeIntervalState({
      lastReminderAt: new Date("2026-01-20T00:00:00Z"),
      reminderIntervalCount: 2,
      reminderIntervalUnit: "week",
    });
    expect(
      isDueForReminder(state, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-27T00:00:00Z")),
    ).toBe(false);
    expect(
      isDueForReminder(state, new Date("2026-01-01T00:00:00Z"), new Date("2026-02-04T00:00:00Z")),
    ).toBe(true);
  });
});

describe("hasReminderInterval", () => {
  it("requires positive count and unit", () => {
    expect(hasReminderInterval(makeIntervalState())).toBe(true);
    expect(
      hasReminderInterval(makeIntervalState({ reminderIntervalCount: null, reminderIntervalUnit: null })),
    ).toBe(false);
  });
});

describe("formatReminderInterval", () => {
  it("formats singular and plural units", () => {
    expect(formatReminderInterval(1, "day")).toBe("1 day");
    expect(formatReminderInterval(2, "week", { prefixEvery: true })).toBe("every 2 weeks");
  });
});
