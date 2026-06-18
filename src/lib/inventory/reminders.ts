import { eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryItems, inventoryMaintenanceReminders } from "@/db/schema";
import {
  isMaintenanceReminderDueForReminder,
  reminderIntervalState,
} from "@/lib/inventory/reminder-interval";
import { emitInventoryMaintenanceReminder } from "@/lib/notifications/emit";
import { formatReminderIntervalPhrase, hasReminderInterval } from "@/lib/reminders/interval";

export async function processInventoryMaintenanceReminders(): Promise<void> {
  const db = getDb();
  const reminders = await db
    .select({
      reminder: inventoryMaintenanceReminders,
      itemName: inventoryItems.name,
    })
    .from(inventoryMaintenanceReminders)
    .innerJoin(inventoryItems, eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItems.id))
    .where(isNotNull(inventoryMaintenanceReminders.reminderIntervalCount));

  const now = new Date();

  for (const { reminder, itemName } of reminders) {
    if (!hasReminderInterval(reminderIntervalState(reminder))) {
      continue;
    }

    if (!isMaintenanceReminderDueForReminder(reminder, now)) {
      continue;
    }

    const intervalLabel = formatReminderIntervalPhrase(
      reminder.reminderIntervalCount!,
      reminder.reminderIntervalUnit!,
    );

    await emitInventoryMaintenanceReminder({
      inventoryItemId: reminder.inventoryItemId,
      reminderTitle: reminder.title,
      itemName,
      intervalLabel,
      recipientUserId: reminder.reminderRecipientUserId,
    });

    await db
      .update(inventoryMaintenanceReminders)
      .set({ lastReminderAt: now, updatedAt: now })
      .where(eq(inventoryMaintenanceReminders.id, reminder.id));
  }
}
