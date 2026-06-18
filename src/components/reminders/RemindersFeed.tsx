import type { UpcomingReminder } from "@/lib/reminders/feed";
import { ReminderFeedItem } from "@/components/reminders/ReminderFeedItem";

function ReminderGroup({
  title,
  reminders,
  compact,
}: {
  title: string;
  reminders: UpcomingReminder[];
  compact?: boolean;
}) {
  if (reminders.length === 0) {
    return null;
  }

  return (
    <section className={compact ? "space-y-2" : "space-y-3"}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className={compact ? "space-y-1" : "space-y-2"}>
        {reminders.map((reminder) => (
          <ReminderFeedItem
            key={`${reminder.kind}-${reminder.id}`}
            reminder={reminder}
            compact={compact}
          />
        ))}
      </ul>
    </section>
  );
}

export function RemindersFeed({
  reminders,
  compact = false,
}: {
  reminders: UpcomingReminder[];
  compact?: boolean;
}) {
  if (reminders.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No reminders due in the next two weeks. You&apos;re all caught up.
      </p>
    );
  }

  const overdue = reminders.filter((reminder) => reminder.status === "overdue");
  const dueSoon = reminders.filter((reminder) => reminder.status === "due_soon");

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <ReminderGroup title="Overdue" reminders={overdue} compact={compact} />
      <ReminderGroup title="Due soon" reminders={dueSoon} compact={compact} />
    </div>
  );
}
