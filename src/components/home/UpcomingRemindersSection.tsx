import Link from "next/link";
import { RemindersFeed } from "@/components/reminders/RemindersFeed";
import { getUpcomingReminders } from "@/lib/actions/reminders";

export async function UpcomingRemindersSection({ limit = 5 }: { limit?: number }) {
  const reminders = await getUpcomingReminders({ withinDays: 14, limit });

  if (reminders.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-text">Upcoming reminders</h2>
          <p className="text-xs text-text-muted">Maintenance and metrics due in the next two weeks</p>
        </div>
        <Link
          href="/reminders"
          className="text-xs uppercase tracking-[0.1em] text-accent hover:text-accent/80 focus-visible:outline-none"
        >
          View all
        </Link>
      </div>
      <div className="mt-3">
        <RemindersFeed reminders={reminders} compact />
      </div>
    </section>
  );
}
