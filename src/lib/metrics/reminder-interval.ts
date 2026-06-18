import { type Metric, type MetricEntry, type MetricReminderUnit } from "@/db/schema";
import {
  hasReminderInterval as hasReminderIntervalState,
  isDueForReminder,
  isStale,
  type ReminderIntervalState,
} from "@/lib/reminders/interval";
import { isReminderVisibleToUser } from "@/lib/reminders/scope";

export {
  addReminderInterval,
  DEFAULT_REMINDER_INTERVAL_COUNT,
  DEFAULT_REMINDER_INTERVAL_UNIT,
  formatReminderInterval,
  formatReminderIntervalPhrase,
  reminderUnits as METRIC_REMINDER_UNITS,
} from "@/lib/reminders/interval";

export { reminderUnitSchema as metricReminderUnitSchema } from "@/lib/reminders/interval";

export function metricIntervalState(metric: Metric): ReminderIntervalState {
  return {
    reminderIntervalCount: metric.reminderIntervalCount,
    reminderIntervalUnit: metric.reminderIntervalUnit as MetricReminderUnit | null,
    lastReminderAt: metric.lastReminderAt,
  };
}

export function hasReminderInterval(metric: Metric): boolean {
  return hasReminderIntervalState(metricIntervalState(metric));
}

export function getMetricReminderAnchor(metric: Metric, latestEntry: MetricEntry | null): Date {
  return latestEntry?.recordedAt ?? metric.createdAt;
}

export function isMetricStale(
  metric: Metric,
  latestEntry: MetricEntry | null,
  now: Date = new Date(),
  viewerUserId?: string,
): boolean {
  if (viewerUserId && !isReminderVisibleToUser(metric.reminderRecipientUserId, viewerUserId)) {
    return false;
  }

  return isStale(metricIntervalState(metric), getMetricReminderAnchor(metric, latestEntry), now);
}

export function isMetricDueForReminder(
  metric: Metric,
  latestEntry: MetricEntry | null,
  now: Date = new Date(),
): boolean {
  return isDueForReminder(
    metricIntervalState(metric),
    getMetricReminderAnchor(metric, latestEntry),
    now,
  );
}
