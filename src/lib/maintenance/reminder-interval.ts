import type { MaintenanceLogReminder } from "@/db/schema/maintenance";
import {
  hasReminderInterval,
  isDueForReminder,
  isStale,
  type ReminderIntervalState,
} from "@/lib/reminders/interval";
import { isReminderVisibleToUser } from "@/lib/reminders/scope";

export function reminderIntervalState(
  reminder: Pick<
    MaintenanceLogReminder,
    "reminderIntervalCount" | "reminderIntervalUnit" | "lastReminderAt"
  >,
): ReminderIntervalState {
  return {
    reminderIntervalCount: reminder.reminderIntervalCount,
    reminderIntervalUnit: reminder.reminderIntervalUnit,
    lastReminderAt: reminder.lastReminderAt,
  };
}

export function getMaintenanceLogReminderAnchor(
  reminder: Pick<MaintenanceLogReminder, "lastCompletedAt" | "createdAt">,
): Date {
  return reminder.lastCompletedAt ?? reminder.createdAt;
}

export function isMaintenanceLogIntervalReminderStale(
  reminder: MaintenanceLogReminder,
  now: Date,
  viewerUserId: string,
): boolean {
  if (reminder.reminderType !== "interval") {
    return false;
  }
  if (!isReminderVisibleToUser(reminder.reminderRecipientUserId, viewerUserId)) {
    return false;
  }
  const state = reminderIntervalState(reminder);
  if (!hasReminderInterval(state)) {
    return false;
  }
  return isStale(state, getMaintenanceLogReminderAnchor(reminder), now);
}

export function isMaintenanceLogOneTimeReminderStale(
  reminder: MaintenanceLogReminder,
  now: Date,
  viewerUserId: string,
): boolean {
  if (reminder.reminderType !== "one_time") {
    return false;
  }
  if (reminder.lastCompletedAt) {
    return false;
  }
  if (!reminder.dueAt) {
    return false;
  }
  if (!isReminderVisibleToUser(reminder.reminderRecipientUserId, viewerUserId)) {
    return false;
  }
  return now.getTime() >= reminder.dueAt.getTime();
}

export function isMaintenanceLogReminderStale(
  reminder: MaintenanceLogReminder,
  now: Date,
  viewerUserId: string,
): boolean {
  if (reminder.reminderType === "interval") {
    return isMaintenanceLogIntervalReminderStale(reminder, now, viewerUserId);
  }
  return isMaintenanceLogOneTimeReminderStale(reminder, now, viewerUserId);
}

export function isMaintenanceLogIntervalDueForNotification(
  reminder: MaintenanceLogReminder,
  now: Date,
): boolean {
  if (reminder.reminderType !== "interval") {
    return false;
  }
  const state = reminderIntervalState(reminder);
  if (!hasReminderInterval(state)) {
    return false;
  }
  return isDueForReminder(state, getMaintenanceLogReminderAnchor(reminder), now);
}

export function isMaintenanceLogOneTimeDueForNotification(
  reminder: MaintenanceLogReminder,
  now: Date,
): boolean {
  if (reminder.reminderType !== "one_time") {
    return false;
  }
  if (reminder.lastCompletedAt || !reminder.dueAt) {
    return false;
  }
  if (now.getTime() < reminder.dueAt.getTime()) {
    return false;
  }
  if (!reminder.lastReminderAt) {
    return true;
  }
  const retryAt = new Date(reminder.lastReminderAt);
  retryAt.setDate(retryAt.getDate() + 1);
  return now.getTime() >= retryAt.getTime();
}

export function isMaintenanceLogReminderDueForNotification(
  reminder: MaintenanceLogReminder,
  now: Date,
): boolean {
  if (reminder.reminderType === "interval") {
    return isMaintenanceLogIntervalDueForNotification(reminder, now);
  }
  return isMaintenanceLogOneTimeDueForNotification(reminder, now);
}
