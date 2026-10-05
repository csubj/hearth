/**
 * Date utilities for reminders (design D14, task 11.1).
 *
 * Reminders are date-based: `due_on` is a calendar date (`YYYY-MM-DD`). There
 * is no time of day, so no DST problems. The instance time zone
 * (`HEARTH_TIMEZONE`, IANA name, default `UTC`) is used ONLY to compute
 * "today". Month arithmetic clamps to month end (Jan 31 + 1 month = Feb 28/29).
 *
 * This module is isomorphic (no server-only imports) so it can be unit-tested
 * directly and reused on the client if needed.
 */

/** Interval units a reminder can repeat in (design D14, task 11.1). */
export type IntervalUnit = "day" | "week" | "month" | "year";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The instance time zone name (IANA), defaulting to UTC. */
export function hearthTimeZone(): string {
  return process.env.HEARTH_TIMEZONE || "UTC";
}

/** Whether `year` is a leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Number of days in a month, where `month` is 1–12.
 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Compute "today" as a `YYYY-MM-DD` calendar date in the given time zone.
 *
 * `HEARTH_TIMEZONE` is used only here, so the instance's notion of "today"
 * (e.g. for a due reminder) is what the household sees, not UTC.
 */
export function todayInZone(
  now: Date = new Date(),
  timeZone = hearthTimeZone(),
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Add `count` intervals of `unit` to a `YYYY-MM-DD` calendar date.
 *
 * Month and year arithmetic clamps to month end: adding a month/year to a
 * date that does not exist in the target month gives the last day of that
 * month (Jan 31 + 1 month = Feb 28/29; Feb 29 + 1 year = Feb 28).
 */
export function addInterval(
  dateStr: string,
  count: number,
  unit: IntervalUnit,
): string {
  const match = DATE_RE.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Day / week arithmetic is plain calendar-day math with no clamping.
  if (unit === "day" || unit === "week") {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + count * (unit === "week" ? 7 : 1));
    return d.toISOString().slice(0, 10);
  }

  // Month / year arithmetic with month-end clamping.
  let newYear = year;
  let newMonth = month;
  if (unit === "month") {
    const total = year * 12 + (month - 1) + count;
    newYear = Math.floor(total / 12);
    newMonth = (total % 12) + 1;
  } else {
    // unit === "year"
    newYear = year + count;
  }

  const newDay = Math.min(day, daysInMonth(newYear, newMonth));
  return `${pad(newYear)}-${pad(newMonth)}-${pad(newDay)}`;
}

/**
 * Compute a reminder's first due date: exactly one interval after a start
 * date (design D14: "creation date + one interval"). The member may instead
 * choose a different first due date at creation.
 */
export function firstIntervalDueOn(
  startDate: string,
  count: number,
  unit: IntervalUnit,
): string {
  return addInterval(startDate, count, unit);
}
