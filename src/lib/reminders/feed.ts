import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  inventoryItems,
  inventoryMaintenanceReminders,
  maintenanceLogReminders,
  maintenanceLogs,
  metricEntries,
  metrics,
} from "@/db/schema";
import {
  getMaintenanceReminderAnchor,
  reminderIntervalState,
} from "@/lib/inventory/reminder-interval";
import {
  getMaintenanceLogReminderAnchor,
  reminderIntervalState as maintenanceLogReminderIntervalState,
} from "@/lib/maintenance/reminder-interval";
import { metricIntervalState } from "@/lib/metrics/reminder-interval";
import {
  addReminderInterval,
  formatReminderInterval,
  getReminderDueAt,
  hasReminderInterval,
} from "@/lib/reminders/interval";
import { isReminderVisibleToUser } from "@/lib/reminders/scope";

export type UpcomingReminderKind = "inventory_maintenance" | "metric" | "maintenance_log";

export type UpcomingReminderStatus = "overdue" | "due_soon";

export type UpcomingReminder = {
  id: string;
  kind: UpcomingReminderKind;
  title: string;
  contextLabel: string;
  href: string;
  dueAt: Date;
  status: UpcomingReminderStatus;
  intervalLabel: string;
  recipientUserId: string | null;
  inventoryItemId?: string;
  reminderId?: string;
  maintenanceLogId?: string;
};

export type ListUpcomingRemindersInput = {
  viewerUserId: string;
  withinDays?: number;
  limit?: number;
  now?: Date;
};

function isWithinWindow(dueAt: Date, now: Date, withinDays: number): boolean {
  const windowEnd = addReminderInterval(now, withinDays, "day");
  return dueAt.getTime() <= windowEnd.getTime();
}

function toStatus(dueAt: Date, now: Date): UpcomingReminderStatus {
  return dueAt.getTime() <= now.getTime() ? "overdue" : "due_soon";
}

async function getLatestEntriesByMetric(metricIds: string[]) {
  const latest = new Map<string, { recordedAt: Date }>();
  const db = getDb();

  await Promise.all(
    metricIds.map(async (metricId) => {
      const [entry] = await db
        .select({ recordedAt: metricEntries.recordedAt })
        .from(metricEntries)
        .where(eq(metricEntries.metricId, metricId))
        .orderBy(desc(metricEntries.recordedAt), desc(metricEntries.createdAt))
        .limit(1);

      if (entry) {
        latest.set(metricId, entry);
      }
    }),
  );

  return latest;
}

async function listInventoryMaintenanceUpcoming(
  input: ListUpcomingRemindersInput,
): Promise<UpcomingReminder[]> {
  const { viewerUserId, withinDays = 14, now = new Date() } = input;
  const db = getDb();

  const rows = await db
    .select({
      reminder: inventoryMaintenanceReminders,
      itemName: inventoryItems.name,
    })
    .from(inventoryMaintenanceReminders)
    .innerJoin(inventoryItems, eq(inventoryMaintenanceReminders.inventoryItemId, inventoryItems.id))
    .where(isNotNull(inventoryMaintenanceReminders.reminderIntervalCount));

  const results: UpcomingReminder[] = [];

  for (const { reminder, itemName } of rows) {
    const state = reminderIntervalState(reminder);
    if (!hasReminderInterval(state)) {
      continue;
    }

    if (!isReminderVisibleToUser(reminder.reminderRecipientUserId, viewerUserId)) {
      continue;
    }

    const dueAt = getReminderDueAt(state, getMaintenanceReminderAnchor(reminder));
    if (!dueAt) {
      continue;
    }

    const overdue = dueAt.getTime() <= now.getTime();
    if (!overdue && !isWithinWindow(dueAt, now, withinDays)) {
      continue;
    }

    results.push({
      id: reminder.id,
      kind: "inventory_maintenance",
      title: reminder.title,
      contextLabel: itemName,
      href: `/inventory/${reminder.inventoryItemId}`,
      dueAt,
      status: toStatus(dueAt, now),
      intervalLabel: formatReminderInterval(
        reminder.reminderIntervalCount!,
        reminder.reminderIntervalUnit!,
        { prefixEvery: true },
      ),
      recipientUserId: reminder.reminderRecipientUserId,
      inventoryItemId: reminder.inventoryItemId,
      reminderId: reminder.id,
    });
  }

  return results;
}

async function listMaintenanceLogUpcoming(
  input: ListUpcomingRemindersInput,
): Promise<UpcomingReminder[]> {
  const { viewerUserId, withinDays = 14, now = new Date() } = input;
  const db = getDb();

  const rows = await db
    .select({
      reminder: maintenanceLogReminders,
      logTitle: maintenanceLogs.title,
    })
    .from(maintenanceLogReminders)
    .innerJoin(maintenanceLogs, eq(maintenanceLogReminders.maintenanceLogId, maintenanceLogs.id));

  const results: UpcomingReminder[] = [];

  for (const { reminder, logTitle } of rows) {
    if (!isReminderVisibleToUser(reminder.reminderRecipientUserId, viewerUserId)) {
      continue;
    }

    let dueAt: Date | null = null;
    let intervalLabel = "";

    if (reminder.reminderType === "interval") {
      const state = maintenanceLogReminderIntervalState(reminder);
      if (!hasReminderInterval(state)) {
        continue;
      }
      dueAt = getReminderDueAt(state, getMaintenanceLogReminderAnchor(reminder));
      intervalLabel = formatReminderInterval(
        reminder.reminderIntervalCount!,
        reminder.reminderIntervalUnit!,
        { prefixEvery: true },
      );
    } else if (reminder.reminderType === "one_time") {
      if (reminder.lastCompletedAt || !reminder.dueAt) {
        continue;
      }
      dueAt = reminder.dueAt;
      intervalLabel = "one-time";
    } else {
      continue;
    }

    if (!dueAt) {
      continue;
    }

    const overdue = dueAt.getTime() <= now.getTime();
    if (!overdue && !isWithinWindow(dueAt, now, withinDays)) {
      continue;
    }

    results.push({
      id: reminder.id,
      kind: "maintenance_log",
      title: reminder.title,
      contextLabel: logTitle,
      href: `/maintenance/${reminder.maintenanceLogId}`,
      dueAt,
      status: toStatus(dueAt, now),
      intervalLabel,
      recipientUserId: reminder.reminderRecipientUserId,
      maintenanceLogId: reminder.maintenanceLogId,
      reminderId: reminder.id,
    });
  }

  return results;
}

async function listMetricUpcoming(input: ListUpcomingRemindersInput): Promise<UpcomingReminder[]> {
  const { viewerUserId, withinDays = 14, now = new Date() } = input;
  const db = getDb();

  const allMetrics = await db
    .select()
    .from(metrics)
    .where(isNotNull(metrics.reminderIntervalCount));

  const latestByMetric = await getLatestEntriesByMetric(allMetrics.map((metric) => metric.id));
  const results: UpcomingReminder[] = [];

  for (const metric of allMetrics) {
    const state = metricIntervalState(metric);
    if (!hasReminderInterval(state)) {
      continue;
    }

    if (!isReminderVisibleToUser(metric.reminderRecipientUserId, viewerUserId)) {
      continue;
    }

    const latestEntry = latestByMetric.get(metric.id) ?? null;
    const anchor = latestEntry?.recordedAt ?? metric.createdAt;
    const dueAt = getReminderDueAt(state, anchor);
    if (!dueAt) {
      continue;
    }

    const overdue = dueAt.getTime() <= now.getTime();
    if (!overdue && !isWithinWindow(dueAt, now, withinDays)) {
      continue;
    }

    results.push({
      id: metric.id,
      kind: "metric",
      title: metric.name,
      contextLabel: latestEntry
        ? `Last logged ${latestEntry.recordedAt.toLocaleDateString(undefined, { dateStyle: "medium" })}`
        : "No entries yet",
      href: `/metrics/${metric.id}`,
      dueAt,
      status: toStatus(dueAt, now),
      intervalLabel: formatReminderInterval(
        metric.reminderIntervalCount!,
        metric.reminderIntervalUnit!,
        { prefixEvery: true },
      ),
      recipientUserId: metric.reminderRecipientUserId,
    });
  }

  return results;
}

export async function listUpcomingReminders(
  input: ListUpcomingRemindersInput,
): Promise<UpcomingReminder[]> {
  const [inventoryReminders, metricReminders, maintenanceLogRemindersList] = await Promise.all([
    listInventoryMaintenanceUpcoming(input),
    listMetricUpcoming(input),
    listMaintenanceLogUpcoming(input),
  ]);

  const merged = [...inventoryReminders, ...metricReminders, ...maintenanceLogRemindersList].sort(
    (a, b) => {
      if (a.status !== b.status) {
        return a.status === "overdue" ? -1 : 1;
      }
      return a.dueAt.getTime() - b.dueAt.getTime();
    },
  );

  if (input.limit != null) {
    return merged.slice(0, input.limit);
  }

  return merged;
}
