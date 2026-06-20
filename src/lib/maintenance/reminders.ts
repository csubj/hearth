import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { maintenanceLogReminders, maintenanceLogs } from "@/db/schema";
import { isMaintenanceLogReminderDueForNotification } from "@/lib/maintenance/reminder-interval";
import { emitMaintenanceLogReminder } from "@/lib/notifications/emit";
import { formatReminderIntervalPhrase, hasReminderInterval } from "@/lib/reminders/interval";
import { reminderIntervalState } from "@/lib/maintenance/reminder-interval";

export async function processMaintenanceLogReminders(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      reminder: maintenanceLogReminders,
      logTitle: maintenanceLogs.title,
    })
    .from(maintenanceLogReminders)
    .innerJoin(maintenanceLogs, eq(maintenanceLogReminders.maintenanceLogId, maintenanceLogs.id));

  const now = new Date();

  for (const { reminder, logTitle } of rows) {
    if (!isMaintenanceLogReminderDueForNotification(reminder, now)) {
      continue;
    }

    const intervalLabel =
      reminder.reminderType === "interval" &&
      hasReminderInterval(reminderIntervalState(reminder)) &&
      reminder.reminderIntervalCount &&
      reminder.reminderIntervalUnit
        ? formatReminderIntervalPhrase(
            reminder.reminderIntervalCount,
            reminder.reminderIntervalUnit,
          )
        : reminder.dueAt
          ? `by ${reminder.dueAt.toLocaleDateString(undefined, { dateStyle: "medium" })}`
          : "soon";

    await emitMaintenanceLogReminder({
      maintenanceLogId: reminder.maintenanceLogId,
      reminderTitle: reminder.title,
      logTitle,
      intervalLabel,
      recipientUserId: reminder.reminderRecipientUserId,
    });

    await db
      .update(maintenanceLogReminders)
      .set({ lastReminderAt: now, updatedAt: now })
      .where(eq(maintenanceLogReminders.id, reminder.id));
  }
}
