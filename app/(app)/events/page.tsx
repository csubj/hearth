import { EventCreateCollapsible } from "@/components/events/EventCreateCollapsible";
import { EventList } from "@/components/events/EventList";
import { listPastEvents, listUpcomingEvents } from "@/lib/actions/events";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function EventsPage() {
  const [upcoming, past, mentionUsers] = await Promise.all([
    listUpcomingEvents(),
    listPastEvents(),
    loadMentionUsers(),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Events</h1>
          <p className="mt-1 text-sm text-text-muted">
            Upcoming plans and past occasions, sorted by date.
          </p>
        </div>
        <EventCreateCollapsible users={mentionUsers} />
      </header>

      <EventList
        title="Upcoming"
        events={upcoming}
        emptyMessage="Nothing on the calendar yet."
        users={mentionUsers}
      />

      <EventList title="Past" events={past} emptyMessage="No past events." muted users={mentionUsers} />
    </div>
  );
}
