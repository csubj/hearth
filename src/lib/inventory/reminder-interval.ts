import { type InventoryMaintenanceReminder } from "@/db/schema";
import type { MaintenanceReminderUnit } from "@/db/schema/inventory";
import {
  hasReminderInterval,
  isDueForReminder,
  isStale,
  type ReminderIntervalState,
} from "@/lib/reminders/interval";
import { isReminderVisibleToUser } from "@/lib/reminders/scope";

export function getMaintenanceReminderAnchor(reminder: InventoryMaintenanceReminder): Date {
  return reminder.lastCompletedAt ?? reminder.createdAt;
}

export function reminderIntervalState(
  reminder: InventoryMaintenanceReminder,
): ReminderIntervalState {
  return {
    reminderIntervalCount: reminder.reminderIntervalCount,
    reminderIntervalUnit: reminder.reminderIntervalUnit as MaintenanceReminderUnit | null,
    lastReminderAt: reminder.lastReminderAt,
  };
}

export function isMaintenanceReminderStale(
  reminder: InventoryMaintenanceReminder,
  now: Date = new Date(),
  viewerUserId?: string,
): boolean {
  if (viewerUserId && !isReminderVisibleToUser(reminder.reminderRecipientUserId, viewerUserId)) {
    return false;
  }

  return isStale(
    reminderIntervalState(reminder),
    getMaintenanceReminderAnchor(reminder),
    now,
  );
}

export function isMaintenanceReminderDueForReminder(
  reminder: InventoryMaintenanceReminder,
  now: Date = new Date(),
): boolean {
  if (!hasReminderInterval(reminderIntervalState(reminder))) {
    return false;
  }

  return isDueForReminder(
    reminderIntervalState(reminder),
    getMaintenanceReminderAnchor(reminder),
    now,
  );
}
