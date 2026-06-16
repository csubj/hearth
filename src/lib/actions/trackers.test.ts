import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { trackerEntries, trackers } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";
import { emitHouseholdActivity } from "@/lib/notifications/emit";
import {
  STALE_THRESHOLD_MS,
  addEntryRecord,
  createTrackerRecord,
  ensureTrackerTablesForTests,
  getTrackerWithEntries,
  getTrackersHomeSummary,
  isTrackerStale,
  listTrackersWithLatest,
  updateTrackerRecord,
} from "@/lib/actions/trackers";

const mockRequireUser = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => mockRequireUser(),
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: vi.fn(),
  emitMentions: vi.fn(),
}));

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  ensureTrackerTablesForTests();
}

describe("isTrackerStale", () => {
  it("flags trackers with no entries as stale", () => {
    expect(isTrackerStale(null)).toBe(true);
  });

  it("flags entries older than the threshold as stale", () => {
    const old = new Date(Date.now() - STALE_THRESHOLD_MS - 1);
    expect(isTrackerStale(old)).toBe(true);
  });

  it("does not flag recent entries as stale", () => {
    const recent = new Date(Date.now() - STALE_THRESHOLD_MS + 60_000);
    expect(isTrackerStale(recent)).toBe(false);
  });
});

describe("tracker records", () => {
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

    await expect(listTrackersWithLatest()).rejects.toThrow("REDIRECT:/login");
    await expect(getTrackerWithEntries(crypto.randomUUID())).rejects.toThrow("REDIRECT:/login");
    await expect(getTrackersHomeSummary()).rejects.toThrow("REDIRECT:/login");
  });

  it("creates a tracker and lists it with no latest entry", async () => {
    const user = await createTestUser();
    mockSession(user);
    const tracker = await createTrackerRecord(user.id, { name: "Flora's weight", unit: "lbs" });

    const items = await listTrackersWithLatest();
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(tracker.id);
    expect(items[0]?.name).toBe("Flora's weight");
    expect(items[0]?.latestEntry).toBeNull();
    expect(items[0]?.stale).toBe(true);
  });

  it("adds dated entries with value and note", async () => {
    const user = await createTestUser({ displayName: "Alice" });
    mockSession(user);
    const tracker = await createTrackerRecord(user.id, { name: "Water meter", unit: "gal" });
    const recordedAt = new Date("2026-06-01T12:00:00");

    const result = await addEntryRecord(user.id, {
      trackerId: tracker.id,
      value: "1234",
      note: "Monthly reading",
      recordedAt,
    });

    expect(result).not.toBeNull();
    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tracker.entry_added",
        summary: "Alice logged 1234 gal on Water meter",
      }),
    );
    const detail = await getTrackerWithEntries(tracker.id);
    expect(detail?.entries).toHaveLength(1);
    expect(detail?.entries[0]?.value).toBe("1234");
    expect(detail?.entries[0]?.note).toBe("Monthly reading");
    expect(detail?.entries[0]?.recordedAt.toISOString()).toBe(recordedAt.toISOString());
  });

  it("updates tracker name and unit", async () => {
    const user = await createTestUser();
    mockSession(user);
    const tracker = await createTrackerRecord(user.id, { name: "Old name", unit: "kg" });

    const updated = await updateTrackerRecord(user.id, {
      trackerId: tracker.id,
      name: "New name",
      unit: "",
    });

    expect(updated?.name).toBe("New name");
    expect(updated?.unit).toBeNull();
  });

  it("returns entries sorted by recorded_at descending", async () => {
    const user = await createTestUser();
    mockSession(user);
    const tracker = await createTrackerRecord(user.id, { name: "Scale" });

    await addEntryRecord(user.id, {
      trackerId: tracker.id,
      value: "10",
      recordedAt: new Date("2026-06-01"),
    });
    await addEntryRecord(user.id, {
      trackerId: tracker.id,
      value: "12",
      recordedAt: new Date("2026-06-10"),
    });

    const detail = await getTrackerWithEntries(tracker.id);
    expect(detail?.entries.map((entry) => entry.value)).toEqual(["12", "10"]);
  });

  it("summarizes home trackers with stale items first", async () => {
    const user = await createTestUser();
    mockSession(user);
    const fresh = await createTrackerRecord(user.id, { name: "Fresh" });
    const stale = await createTrackerRecord(user.id, { name: "Stale" });

    await addEntryRecord(user.id, {
      trackerId: fresh.id,
      value: "1",
      recordedAt: new Date(),
    });
    await addEntryRecord(user.id, {
      trackerId: stale.id,
      value: "2",
      recordedAt: new Date(Date.now() - STALE_THRESHOLD_MS - 86_400_000),
    });

    const summary = await getTrackersHomeSummary();
    expect(summary.map((item) => item.name)).toEqual(["Stale", "Fresh"]);
    expect(summary[0]?.stale).toBe(true);
    expect(summary[1]?.stale).toBe(false);
  });

  it("cascades entry deletion when tracker is removed", async () => {
    const user = await createTestUser();
    mockSession(user);
    const tracker = await createTrackerRecord(user.id, { name: "Temp" });
    await addEntryRecord(user.id, { trackerId: tracker.id, value: "1" });

    await getDb().delete(trackers).where(eq(trackers.id, tracker.id));

    const remaining = await getDb()
      .select()
      .from(trackerEntries)
      .where(eq(trackerEntries.trackerId, tracker.id));
    expect(remaining).toHaveLength(0);
  });
});
