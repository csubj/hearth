import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { metrics, type Metric } from "@/db/schema";
import { ensureMetricTablesForTests } from "@/lib/actions/metrics";
import { createTestUser } from "@/lib/auth/test-helpers";
import {
  addReminderInterval,
  formatReminderInterval,
  isMetricDueForReminder,
  isMetricStale,
} from "@/lib/metrics/reminder-interval";
import { processMetricReminders } from "@/lib/metrics/reminders";
import { emitMetricReminder } from "@/lib/notifications/emit";

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: vi.fn(),
  emitMentions: vi.fn(),
  emitMetricReminder: vi.fn(),
}));

function resetTestDb(): void {
  resetDbForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  ensureMetricTablesForTests();
}

function makeMetric(overrides: Partial<Metric> = {}): Metric {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name: "Test metric",
    unit: null,
    reminderIntervalCount: 7,
    reminderIntervalUnit: "day",
    lastReminderAt: null,
    reminderRecipientUserId: null,
    createdByUserId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
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

describe("isMetricStale", () => {
  it("returns false when reminders are disabled", () => {
    const metric = makeMetric({ reminderIntervalCount: null, reminderIntervalUnit: null });
    expect(isMetricStale(metric, null)).toBe(false);
  });

  it("flags metrics past the interval since creation when there are no entries", () => {
    const metric = makeMetric({
      createdAt: new Date("2026-01-01T00:00:00Z"),
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
    });
    expect(isMetricStale(metric, null, new Date("2026-01-20T00:00:00Z"))).toBe(true);
  });

  it("does not flag new metrics without entries before the interval elapses", () => {
    const metric = makeMetric({
      createdAt: new Date("2026-06-10T00:00:00Z"),
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
    });
    expect(isMetricStale(metric, null, new Date("2026-06-12T00:00:00Z"))).toBe(false);
  });

  it("uses the latest entry recordedAt as the anchor", () => {
    const metric = makeMetric({ reminderIntervalCount: 1, reminderIntervalUnit: "week" });
    const latestEntry = {
      id: crypto.randomUUID(),
      metricId: metric.id,
      value: "10",
      note: null,
      recordedAt: new Date("2026-06-01T00:00:00Z"),
      createdByUserId: metric.createdByUserId,
      createdAt: new Date("2026-06-01T00:00:00Z"),
    };
    expect(isMetricStale(metric, latestEntry, new Date("2026-06-10T00:00:00Z"))).toBe(true);
    expect(isMetricStale(metric, latestEntry, new Date("2026-06-05T00:00:00Z"))).toBe(false);
  });
});

describe("isMetricDueForReminder", () => {
  it("is due on first stale check when no reminder has been sent", () => {
    const metric = makeMetric({
      createdAt: new Date("2026-01-01T00:00:00Z"),
      lastReminderAt: null,
    });
    expect(isMetricDueForReminder(metric, null, new Date("2026-01-20T00:00:00Z"))).toBe(true);
  });

  it("waits for the retry interval after the last reminder", () => {
    const metric = makeMetric({
      createdAt: new Date("2026-01-01T00:00:00Z"),
      lastReminderAt: new Date("2026-01-20T00:00:00Z"),
      reminderIntervalCount: 2,
      reminderIntervalUnit: "week",
    });
    expect(isMetricDueForReminder(metric, null, new Date("2026-01-27T00:00:00Z"))).toBe(false);
    expect(isMetricDueForReminder(metric, null, new Date("2026-02-04T00:00:00Z"))).toBe(true);
  });
});

describe("formatReminderInterval", () => {
  it("formats singular and plural units", () => {
    expect(formatReminderInterval(1, "day")).toBe("1 day");
    expect(formatReminderInterval(2, "week", { prefixEvery: true })).toBe("every 2 weeks");
  });
});

describe("processMetricReminders", () => {
  beforeEach(() => {
    resetTestDb();
    vi.clearAllMocks();
  });

  it("emits reminders for due metrics and records last_reminder_at", async () => {
    const user = await createTestUser();
    const now = new Date("2026-06-20T00:00:00Z");
    const metricId = crypto.randomUUID();
    await getDb().insert(metrics).values({
      id: metricId,
      name: "Flora's weight",
      unit: "lbs",
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      lastReminderAt: null,
      createdByUserId: user.id,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);
    await processMetricReminders();
    vi.useRealTimers();

    expect(emitMetricReminder).toHaveBeenCalledWith({
      metricId,
      metricName: "Flora's weight",
      intervalLabel: "7 days",
      recipientUserId: null,
    });

    const [updated] = await getDb().select().from(metrics).where(eq(metrics.id, metricId));
    expect(updated?.lastReminderAt?.toISOString()).toBe(now.toISOString());
  });

  it("skips metrics that are not yet due for retry", async () => {
    const user = await createTestUser();
    const metricId = crypto.randomUUID();
    await getDb().insert(metrics).values({
      id: metricId,
      name: "Fresh metric",
      unit: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      lastReminderAt: new Date("2026-06-18T00:00:00Z"),
      createdByUserId: user.id,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:00:00Z"));
    await processMetricReminders();
    vi.useRealTimers();

    expect(emitMetricReminder).not.toHaveBeenCalled();
  });
});
