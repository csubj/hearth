import { z } from "zod";

export const reminderUnits = ["day", "week", "month", "year"] as const;
export type ReminderUnit = (typeof reminderUnits)[number];

export const reminderUnitSchema = z.enum(reminderUnits);

export const DEFAULT_REMINDER_INTERVAL_COUNT = 7;
export const DEFAULT_REMINDER_INTERVAL_UNIT: ReminderUnit = "day";

export type ReminderIntervalState = {
  reminderIntervalCount: number | null;
  reminderIntervalUnit: ReminderUnit | null;
  lastReminderAt: Date | null;
};

export function addReminderInterval(date: Date, count: number, unit: ReminderUnit): Date {
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

export function hasReminderInterval(state: ReminderIntervalState): boolean {
  return (
    state.reminderIntervalCount != null &&
    state.reminderIntervalCount > 0 &&
    state.reminderIntervalUnit != null
  );
}

export function isStale(
  state: ReminderIntervalState,
  anchor: Date,
  now: Date = new Date(),
): boolean {
  if (!hasReminderInterval(state)) {
    return false;
  }

  const dueAt = addReminderInterval(
    anchor,
    state.reminderIntervalCount!,
    state.reminderIntervalUnit!,
  );
  return now.getTime() > dueAt.getTime();
}

export function isDueForReminder(
  state: ReminderIntervalState,
  anchor: Date,
  now: Date = new Date(),
): boolean {
  if (!isStale(state, anchor, now)) {
    return false;
  }

  if (!state.lastReminderAt) {
    return true;
  }

  const retryAt = addReminderInterval(
    state.lastReminderAt,
    state.reminderIntervalCount!,
    state.reminderIntervalUnit!,
  );
  return now.getTime() > retryAt.getTime();
}

const UNIT_LABELS: Record<ReminderUnit, { one: string; other: string }> = {
  day: { one: "day", other: "days" },
  week: { one: "week", other: "weeks" },
  month: { one: "month", other: "months" },
  year: { one: "year", other: "years" },
};

export function formatReminderInterval(
  count: number,
  unit: ReminderUnit,
  { prefixEvery = false }: { prefixEvery?: boolean } = {},
): string {
  const labels = UNIT_LABELS[unit];
  const label = count === 1 ? labels.one : labels.other;
  const interval = `${count} ${label}`;
  return prefixEvery ? `every ${interval}` : interval;
}

export function formatReminderIntervalPhrase(count: number, unit: ReminderUnit): string {
  return formatReminderInterval(count, unit);
}
