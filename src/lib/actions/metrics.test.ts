import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { metricEntries, metrics } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";
import { emitHouseholdActivity } from "@/lib/notifications/emit";
import {
  addEntryRecord,
  createMetricRecord,
  ensureMetricTablesForTests,
  getMetricWithEntries,
  getMetricsHomeSummary,
  listMetricsWithLatest,
  updateMetricRecord,
} from "@/lib/actions/metrics";

const mockRequireUser = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: vi.fn(),
  emitMentions: vi.fn(),
  emitMetricReminder: vi.fn(),
}));

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  ensureMetricTablesForTests();
}

describe("metric records", () => {
  beforeEach(() => {
    resetTestDb();
    vi.clearAllMocks();
  });

  function mockSession(user: Awaited<ReturnType<typeof createTestUser>>) {
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "session-1", userId: user.id, expiresAt: new Date() },
    });
  }

  it("requires authentication for read helpers", async () => {
    mockRequireUser.mockImplementation(() => {
      throw new Error("REDIRECT:/login");
    });

    await expect(listMetricsWithLatest()).rejects.toThrow("REDIRECT:/login");
    await expect(getMetricWithEntries(crypto.randomUUID())).rejects.toThrow("REDIRECT:/login");
    await expect(getMetricsHomeSummary()).rejects.toThrow("REDIRECT:/login");
  });

  it("creates a metric with default 7-day reminders and lists it as not stale yet", async () => {
    const user = await createTestUser();
    mockSession(user);
    const metric = await createMetricRecord(user.id, { name: "Flora's weight", unit: "lbs" });

    const items = await listMetricsWithLatest();
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(metric.id);
    expect(items[0]?.name).toBe("Flora's weight");
    expect(items[0]?.latestEntry).toBeNull();
    expect(items[0]?.reminderIntervalCount).toBe(7);
    expect(items[0]?.reminderIntervalUnit).toBe("day");
    expect(items[0]?.stale).toBe(false);
  });

  it("adds dated entries with value and note", async () => {
    const user = await createTestUser({ displayName: "Alice" });
    mockSession(user);
    const metric = await createMetricRecord(user.id, { name: "Water meter", unit: "gal" });
    const recordedAt = new Date("2026-06-01T12:00:00");

    const result = await addEntryRecord(user.id, {
      metricId: metric.id,
      value: "1234",
      note: "Monthly reading",
      recordedAt,
    });

    expect(result).not.toBeNull();
    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "metric.entry_added",
        summary: "Alice logged 1234 gal on Water meter",
      }),
    );
    const detail = await getMetricWithEntries(metric.id);
    expect(detail?.entries).toHaveLength(1);
    expect(detail?.entries[0]?.value).toBe("1234");
    expect(detail?.entries[0]?.note).toBe("Monthly reading");
    expect(detail?.entries[0]?.recordedAt.toISOString()).toBe(recordedAt.toISOString());
  });

  it("clears last_reminder_at when a new entry is added", async () => {
    const user = await createTestUser();
    mockSession(user);
    const metric = await createMetricRecord(user.id, { name: "Scale" });
    await getDb()
      .update(metrics)
      .set({ lastReminderAt: new Date("2026-06-01T00:00:00Z") })
      .where(eq(metrics.id, metric.id));

    await addEntryRecord(user.id, { metricId: metric.id, value: "10" });

    const [updated] = await getDb().select().from(metrics).where(eq(metrics.id, metric.id));
    expect(updated?.lastReminderAt).toBeNull();
  });

  it("updates metric name, unit, and reminder interval", async () => {
    const user = await createTestUser();
    mockSession(user);
    const metric = await createMetricRecord(user.id, { name: "Old name", unit: "kg" });

    const updated = await updateMetricRecord(user.id, {
      metricId: metric.id,
      name: "New name",
      unit: "",
      remindersEnabled: true,
      reminderIntervalCount: 2,
      reminderIntervalUnit: "month",
    });

    expect(updated?.name).toBe("New name");
    expect(updated?.unit).toBeNull();
    expect(updated?.reminderIntervalCount).toBe(2);
    expect(updated?.reminderIntervalUnit).toBe("month");
  });

  it("can disable reminders on update", async () => {
    const user = await createTestUser();
    mockSession(user);
    const metric = await createMetricRecord(user.id, { name: "Optional" });

    const updated = await updateMetricRecord(user.id, {
      metricId: metric.id,
      name: "Optional",
      remindersEnabled: false,
    });

    expect(updated?.reminderIntervalCount).toBeNull();
    expect(updated?.reminderIntervalUnit).toBeNull();
  });

  it("returns entries sorted by recorded_at descending", async () => {
    const user = await createTestUser();
    mockSession(user);
    const metric = await createMetricRecord(user.id, { name: "Scale" });

    await addEntryRecord(user.id, {
      metricId: metric.id,
      value: "10",
      recordedAt: new Date("2026-06-01"),
    });
    await addEntryRecord(user.id, {
      metricId: metric.id,
      value: "12",
      recordedAt: new Date("2026-06-10"),
    });

    const detail = await getMetricWithEntries(metric.id);
    expect(detail?.entries.map((entry) => entry.value)).toEqual(["12", "10"]);
  });

  it("summarizes home metrics with stale items first", async () => {
    const user = await createTestUser();
    mockSession(user);
    const fresh = await createMetricRecord(user.id, { name: "Fresh" });
    const stale = await createMetricRecord(user.id, {
      name: "Stale",
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      remindersEnabled: true,
    });

    await addEntryRecord(user.id, {
      metricId: fresh.id,
      value: "1",
      recordedAt: new Date(),
    });
    await addEntryRecord(user.id, {
      metricId: stale.id,
      value: "2",
      recordedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    const summary = await getMetricsHomeSummary();
    expect(summary.map((item) => item.name)).toEqual(["Stale", "Fresh"]);
    expect(summary[0]?.stale).toBe(true);
    expect(summary[1]?.stale).toBe(false);
  });

  it("cascades entry deletion when metric is removed", async () => {
    const user = await createTestUser();
    mockSession(user);
    const metric = await createMetricRecord(user.id, { name: "Temp" });
    await addEntryRecord(user.id, { metricId: metric.id, value: "1" });

    await getDb().delete(metrics).where(eq(metrics.id, metric.id));

    const remaining = await getDb()
      .select()
      .from(metricEntries)
      .where(eq(metricEntries.metricId, metric.id));
    expect(remaining).toHaveLength(0);
  });
});
