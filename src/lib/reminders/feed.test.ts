import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import {
  inventoryItems,
  inventoryMaintenanceReminders,
  metricEntries,
  metrics,
} from "@/db/schema";
import { ensureInventoryTablesForTests } from "@/lib/actions/inventory-test-setup";
import { ensureMetricTablesForTests } from "@/lib/actions/metrics";
import { createTestUser } from "@/lib/auth/test-helpers";
import { listUpcomingReminders } from "@/lib/reminders/feed";

function resetTestDb(): void {
  resetDbForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  ensureInventoryTablesForTests();
  ensureMetricTablesForTests();
}

describe("listUpcomingReminders", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("includes overdue and due-soon reminders within the window", async () => {
    const user = await createTestUser();
    const now = new Date("2026-06-15T12:00:00Z");
    const itemId = crypto.randomUUID();

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
      createdAt: now,
      updatedAt: now,
    });

    await getDb().insert(inventoryMaintenanceReminders).values({
      id: crypto.randomUUID(),
      inventoryItemId: itemId,
      title: "Clean filter",
      notes: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      reminderRecipientUserId: null,
      lastCompletedAt: new Date("2026-06-01T00:00:00Z"),
      lastReminderAt: null,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const metricId = crypto.randomUUID();
    await getDb().insert(metrics).values({
      id: metricId,
      name: "Weight",
      unit: "lb",
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      lastReminderAt: null,
      reminderRecipientUserId: null,
      createdByUserId: user.id,
      createdAt: new Date("2026-06-10T00:00:00Z"),
      updatedAt: now,
    });

    const reminders = await listUpcomingReminders({
      viewerUserId: user.id,
      withinDays: 14,
      now,
    });

    expect(reminders).toHaveLength(2);
    expect(reminders[0]?.status).toBe("overdue");
    expect(reminders[0]?.kind).toBe("inventory_maintenance");
    expect(reminders[1]?.status).toBe("due_soon");
    expect(reminders[1]?.kind).toBe("metric");
  });

  it("filters reminders outside the due-soon window", async () => {
    const user = await createTestUser();
    const now = new Date("2026-06-15T12:00:00Z");
    const itemId = crypto.randomUUID();

    await getDb().insert(inventoryItems).values({
      id: itemId,
      name: "Vacuum",
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
      createdAt: now,
      updatedAt: now,
    });

    await getDb().insert(inventoryMaintenanceReminders).values({
      id: crypto.randomUUID(),
      inventoryItemId: itemId,
      title: "Replace bag",
      notes: null,
      reminderIntervalCount: 30,
      reminderIntervalUnit: "day",
      reminderRecipientUserId: null,
      lastCompletedAt: new Date("2026-06-10T00:00:00Z"),
      lastReminderAt: null,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const reminders = await listUpcomingReminders({
      viewerUserId: user.id,
      withinDays: 14,
      now,
    });

    expect(reminders).toHaveLength(0);
  });

  it("respects viewer scope for assigned reminders", async () => {
    const owner = await createTestUser({ username: "owner" });
    const other = await createTestUser({ username: "other" });
    const now = new Date("2026-06-15T12:00:00Z");
    const itemId = crypto.randomUUID();

    await getDb().insert(inventoryItems).values({
      id: itemId,
      name: "Router",
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
      createdByUserId: owner.id,
      updatedByUserId: owner.id,
      createdAt: now,
      updatedAt: now,
    });

    await getDb().insert(inventoryMaintenanceReminders).values({
      id: crypto.randomUUID(),
      inventoryItemId: itemId,
      title: "Reboot",
      notes: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      reminderRecipientUserId: owner.id,
      lastCompletedAt: new Date("2026-06-01T00:00:00Z"),
      lastReminderAt: null,
      createdByUserId: owner.id,
      createdAt: now,
      updatedAt: now,
    });

    const ownerReminders = await listUpcomingReminders({
      viewerUserId: owner.id,
      withinDays: 14,
      now,
    });
    const otherReminders = await listUpcomingReminders({
      viewerUserId: other.id,
      withinDays: 14,
      now,
    });

    expect(ownerReminders).toHaveLength(1);
    expect(otherReminders).toHaveLength(0);
  });

  it("sorts mixed kinds with overdue first, then by due date", async () => {
    const user = await createTestUser();
    const now = new Date("2026-06-15T12:00:00Z");
    const itemId = crypto.randomUUID();

    await getDb().insert(inventoryItems).values({
      id: itemId,
      name: "Fridge",
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
      createdAt: now,
      updatedAt: now,
    });

    await getDb().insert(inventoryMaintenanceReminders).values({
      id: crypto.randomUUID(),
      inventoryItemId: itemId,
      title: "Deep clean",
      notes: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      reminderRecipientUserId: null,
      lastCompletedAt: new Date("2026-06-01T00:00:00Z"),
      lastReminderAt: null,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const metricId = crypto.randomUUID();
    await getDb().insert(metrics).values({
      id: metricId,
      name: "Steps",
      unit: null,
      reminderIntervalCount: 7,
      reminderIntervalUnit: "day",
      lastReminderAt: null,
      reminderRecipientUserId: null,
      createdByUserId: user.id,
      createdAt: new Date("2026-06-05T00:00:00Z"),
      updatedAt: now,
    });

    await getDb().insert(metricEntries).values({
      id: crypto.randomUUID(),
      metricId,
      value: "8000",
      note: null,
      recordedAt: new Date("2026-06-01T00:00:00Z"),
      createdByUserId: user.id,
      createdAt: now,
    });

    const reminders = await listUpcomingReminders({
      viewerUserId: user.id,
      withinDays: 14,
      now,
      limit: 10,
    });

    expect(reminders.every((reminder) => reminder.status === "overdue")).toBe(true);
    expect(reminders[0]?.dueAt.getTime()).toBeLessThanOrEqual(reminders[1]?.dueAt.getTime() ?? 0);
  });
});
