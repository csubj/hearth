"use server";

import { requireUser } from "@/lib/auth/session";
import {
  listUpcomingReminders,
  type ListUpcomingRemindersInput,
  type UpcomingReminder,
} from "@/lib/reminders/feed";

export type {
  UpcomingReminder,
  UpcomingReminderKind,
  UpcomingReminderStatus,
} from "@/lib/reminders/feed";

export async function getUpcomingReminders(
  options: Omit<ListUpcomingRemindersInput, "viewerUserId"> = {},
): Promise<UpcomingReminder[]> {
  const { user } = await requireUser();
  return listUpcomingReminders({ ...options, viewerUserId: user.id });
}

export async function getRemindersHomeStats(): Promise<{ overdue: number; dueSoon: number }> {
  const reminders = await getUpcomingReminders({ withinDays: 14 });
  return {
    overdue: reminders.filter((reminder) => reminder.status === "overdue").length,
    dueSoon: reminders.filter((reminder) => reminder.status === "due_soon").length,
  };
}
