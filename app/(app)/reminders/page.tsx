import { RemindersFeed } from "@/components/reminders/RemindersFeed";
import { getUpcomingReminders } from "@/lib/actions/reminders";

export default async function RemindersPage() {
  const reminders = await getUpcomingReminders({ withinDays: 14 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl text-text">Reminders</h1>
        <p className="mt-1 text-sm text-text-muted">
          Inventory maintenance and metric logging due in the next two weeks.
        </p>
      </header>
      <RemindersFeed reminders={reminders} />
    </div>
  );
}
