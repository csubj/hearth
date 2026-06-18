import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import {
  inventoryItems,
  inventoryMaintenanceReminders,
} from "@/db/schema";
import { createTestUser } from "@/lib/auth/test-helpers";
import {
  isMaintenanceReminderDueForReminder,
  isMaintenanceReminderStale,
} from "@/lib/inventory/reminder-interval";
import { processInventoryMaintenanceReminders } from "@/lib/inventory/reminders";
import { emitInventoryMaintenanceReminder } from "@/lib/notifications/emit";

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: vi.fn(),
  emitMentions: vi.fn(),
  emitMetricReminder: vi.fn(),
  emitInventoryMaintenanceReminder: vi.fn(),
  emitIntervalReminder: vi.fn(),
}));

function resetTestDb(): void {
  resetDbForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}

describe("isMaintenanceReminderStale", () => {
  it("respects viewer scope for assigned reminders", () => {
    const reminder = {
      id: crypto.randomUUID(),
      inventoryItemId: crypto.randomUUID(),
      title: "Filter",
      notes: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day" as const,
      reminderRecipientUserId: "user-a",
      lastCompletedAt: new Date("2026-01-01T00:00:00Z"),
      lastReminderAt: null,
      createdByUserId: "user-a",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    expect(
      isMaintenanceReminderStale(reminder, new Date("2026-01-20T00:00:00Z"), "user-a"),
    ).toBe(true);
    expect(
      isMaintenanceReminderStale(reminder, new Date("2026-01-20T00:00:00Z"), "user-b"),
    ).toBe(false);
  });
});

describe("isMaintenanceReminderDueForReminder", () => {
  it("waits for retry after last reminder", () => {
    const reminder = {
      id: crypto.randomUUID(),
      inventoryItemId: crypto.randomUUID(),
      title: "Filter",
      notes: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day" as const,
      reminderRecipientUserId: null,
      lastCompletedAt: new Date("2026-01-01T00:00:00Z"),
      lastReminderAt: new Date("2026-01-15T00:00:00Z"),
      createdByUserId: crypto.randomUUID(),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    expect(isMaintenanceReminderDueForReminder(reminder, new Date("2026-01-18T00:00:00Z"))).toBe(
      false,
    );
    expect(isMaintenanceReminderDueForReminder(reminder, new Date("2026-01-25T00:00:00Z"))).toBe(
      true,
    );
  });
});

describe("processInventoryMaintenanceReminders", () => {
  beforeEach(() => {
    resetTestDb();
    vi.clearAllMocks();
  });

  it("emits reminders and records last_reminder_at", async () => {
    const user = await createTestUser();
    const itemId = crypto.randomUUID();
    const reminderId = crypto.randomUUID();
    const now = new Date("2026-06-20T00:00:00Z");

    await getDb().insert(inventoryItems).values({
      id: itemId,
      name: "Dehumidifier",
      brand: null,
      model: null,
      serial: null,
      itemType: null,
      location: null,
      purchaseDate: null,
      store: null,
      price: null,
      warrantyNote: null,
      notes: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    await getDb().insert(inventoryMaintenanceReminders).values({
      id: reminderId,
      inventoryItemId: itemId,
      title: "Replace filter",
      notes: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      reminderRecipientUserId: null,
      lastCompletedAt: null,
      lastReminderAt: null,
      createdByUserId: user.id,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    vi.useFakeTimers();
    vi.setSystemTime(now);
    await processInventoryMaintenanceReminders();
    vi.useRealTimers();

    expect(emitInventoryMaintenanceReminder).toHaveBeenCalledWith({
      inventoryItemId: itemId,
      reminderTitle: "Replace filter",
      itemName: "Dehumidifier",
      intervalLabel: "7 days",
      recipientUserId: null,
    });

    const [updated] = await getDb()
      .select()
      .from(inventoryMaintenanceReminders)
      .where(eq(inventoryMaintenanceReminders.id, reminderId));
    expect(updated?.lastReminderAt?.toISOString()).toBe(now.toISOString());
  });
});
