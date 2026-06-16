import Link from "next/link";
import { formatEventDate } from "@/components/events/format";
import { listHomeEvents } from "@/lib/actions/events";

export async function EventsSection() {
  const events = await listHomeEvents();

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-text">Events</h2>
        <Link
          href="/events"
          className="text-sm font-medium text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>
      <p className="mt-1 text-sm text-text-muted">Next two weeks</p>

      {events.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No upcoming events in the next 14 days.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((event) => (
            <li key={event.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
              <p className="font-medium text-text">{event.title}</p>
              <p className="text-sm text-text-muted">{formatEventDate(event.startsAt)}</p>
              {event.location ? <p className="text-sm text-text-muted">{event.location}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
