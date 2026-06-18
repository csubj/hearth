import {
  DEFAULT_REMINDER_INTERVAL_COUNT,
  DEFAULT_REMINDER_INTERVAL_UNIT,
  reminderUnits,
} from "@/lib/reminders/interval";
import type { MentionUser } from "@/components/MentionTextarea";

const UNIT_LABELS: Record<(typeof reminderUnits)[number], string> = {
  day: "Days",
  week: "Weeks",
  month: "Months",
  year: "Years",
};

type ReminderIntervalFieldsProps = {
  idPrefix?: string;
  remindersEnabled?: boolean;
  intervalCount?: number | null;
  intervalUnit?: (typeof reminderUnits)[number] | null;
  recipientUserId?: string | null;
  users?: MentionUser[];
  description?: string;
};

export function ReminderIntervalFields({
  idPrefix = "reminder",
  remindersEnabled: remindersEnabledProp,
  intervalCount,
  intervalUnit,
  recipientUserId = null,
  users = [],
  description = "Stale items are flagged in the list and trigger in-app reminders on this schedule.",
}: ReminderIntervalFieldsProps) {
  const remindersEnabled =
    remindersEnabledProp ??
    (intervalCount === undefined && intervalUnit === undefined
      ? true
      : intervalCount != null && intervalUnit != null);
  const count = intervalCount ?? DEFAULT_REMINDER_INTERVAL_COUNT;
  const unit = intervalUnit ?? DEFAULT_REMINDER_INTERVAL_UNIT;
  const scope = recipientUserId ? "user" : "household";

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
        Enable recurring reminders
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
            {reminderUnits.map((value) => (
              <option key={value} value={value}>
                {UNIT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-text-muted">Notify</p>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="reminderScope"
            value="household"
            defaultChecked={scope === "household"}
            className="h-4 w-4 border-border text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
          Whole household
        </label>
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name="reminderScope"
            value="user"
            defaultChecked={scope === "user"}
            className="h-4 w-4 border-border text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
          Specific member
        </label>
        {users.length > 0 ? (
          <select
            name="reminderRecipientUserId"
            defaultValue={recipientUserId ?? ""}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <option value="">Select member…</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName ?? user.username}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <p className="text-xs text-text-muted">{description}</p>
    </fieldset>
  );
}
