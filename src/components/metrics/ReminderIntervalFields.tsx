import {
  DEFAULT_REMINDER_INTERVAL_COUNT,
  DEFAULT_REMINDER_INTERVAL_UNIT,
  METRIC_REMINDER_UNITS,
} from "@/lib/metrics/reminder-interval";
import type { Metric } from "@/db/schema";

const UNIT_LABELS: Record<(typeof METRIC_REMINDER_UNITS)[number], string> = {
  day: "Days",
  week: "Weeks",
  month: "Months",
  year: "Years",
};

type ReminderIntervalFieldsProps = {
  metric?: Metric;
  idPrefix?: string;
};

export function ReminderIntervalFields({ metric, idPrefix = "metric" }: ReminderIntervalFieldsProps) {
  const remindersEnabled =
    metric == null
      ? true
      : metric.reminderIntervalCount != null && metric.reminderIntervalUnit != null;
  const count = metric?.reminderIntervalCount ?? DEFAULT_REMINDER_INTERVAL_COUNT;
  const unit = metric?.reminderIntervalUnit ?? DEFAULT_REMINDER_INTERVAL_UNIT;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-text">Reminder interval</legend>
      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          name="remindersEnabled"
          defaultChecked={remindersEnabled}
          className="h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
        Remind household when this metric hasn&apos;t been logged
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-reminder-count`} className="block text-sm text-text-muted">
            Every
          </label>
          <input
            id={`${idPrefix}-reminder-count`}
            name="reminderIntervalCount"
            type="number"
            min={1}
            max={999}
            defaultValue={count}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-reminder-unit`} className="block text-sm text-text-muted">
            Unit
          </label>
          <select
            id={`${idPrefix}-reminder-unit`}
            name="reminderIntervalUnit"
            defaultValue={unit}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {METRIC_REMINDER_UNITS.map((value) => (
              <option key={value} value={value}>
                {UNIT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Stale metrics are flagged in the list and trigger in-app reminders on this schedule.
      </p>
    </fieldset>
  );
}
