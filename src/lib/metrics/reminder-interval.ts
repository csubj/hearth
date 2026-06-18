import { z } from "zod";
import {
  type Metric,
  type MetricEntry,
  type MetricReminderUnit,
  metricReminderUnits,
} from "@/db/schema";

export const METRIC_REMINDER_UNITS = metricReminderUnits;

export const metricReminderUnitSchema = z.enum(metricReminderUnits);

export const DEFAULT_REMINDER_INTERVAL_COUNT = 7;
export const DEFAULT_REMINDER_INTERVAL_UNIT: MetricReminderUnit = "day";

export function addReminderInterval(
  date: Date,
  count: number,
  unit: MetricReminderUnit,
): Date {
  const result = new Date(date);
  switch (unit) {
    case "day":
      result.setDate(result.getDate() + count);
      break;
    case "week":
      result.setDate(result.getDate() + count * 7);
      break;
    case "month":
      result.setMonth(result.getMonth() + count);
      break;
    case "year":
      result.setFullYear(result.getFullYear() + count);
      break;
  }
  return result;
}

export function hasReminderInterval(metric: Metric): boolean {
  return (
    metric.reminderIntervalCount != null &&
    metric.reminderIntervalCount > 0 &&
    metric.reminderIntervalUnit != null
  );
}

export function getMetricReminderAnchor(metric: Metric, latestEntry: MetricEntry | null): Date {
  return latestEntry?.recordedAt ?? metric.createdAt;
}

export function isMetricStale(
  metric: Metric,
  latestEntry: MetricEntry | null,
  now: Date = new Date(),
): boolean {
  if (!hasReminderInterval(metric)) {
    return false;
  }

  const anchor = getMetricReminderAnchor(metric, latestEntry);
  const dueAt = addReminderInterval(
    anchor,
    metric.reminderIntervalCount!,
    metric.reminderIntervalUnit!,
  );
  return now.getTime() > dueAt.getTime();
}

export function isMetricDueForReminder(
  metric: Metric,
  latestEntry: MetricEntry | null,
  now: Date = new Date(),
): boolean {
  if (!isMetricStale(metric, latestEntry, now)) {
    return false;
  }

  if (!metric.lastReminderAt) {
    return true;
  }

  const retryAt = addReminderInterval(
    metric.lastReminderAt,
    metric.reminderIntervalCount!,
    metric.reminderIntervalUnit!,
  );
  return now.getTime() > retryAt.getTime();
}

const UNIT_LABELS: Record<MetricReminderUnit, { one: string; other: string }> = {
  day: { one: "day", other: "days" },
  week: { one: "week", other: "weeks" },
  month: { one: "month", other: "months" },
  year: { one: "year", other: "years" },
};

export function formatReminderInterval(
  count: number,
  unit: MetricReminderUnit,
  { prefixEvery = false }: { prefixEvery?: boolean } = {},
): string {
  const labels = UNIT_LABELS[unit];
  const label = count === 1 ? labels.one : labels.other;
  const interval = `${count} ${label}`;
  return prefixEvery ? `every ${interval}` : interval;
}

export function formatReminderIntervalPhrase(
  count: number,
  unit: MetricReminderUnit,
): string {
  return formatReminderInterval(count, unit);
}
