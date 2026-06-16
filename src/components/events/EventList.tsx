import { Suspense } from "react";
import type { Event } from "@/db/schema";
import { Attachments } from "@/components/Attachments";
import { EventCard } from "@/components/events/EventCard";

export function EventList({
  title,
  events,
  emptyMessage,
  muted = false,
}: {
  title: string;
  events: Event[];
  emptyMessage: string;
  muted?: boolean;
}) {
  return (
    <section>
      <h2 className="font-serif text-lg text-text">{title}</h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="space-y-3">
              <EventCard event={event} muted={muted} />
              <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <Suspense fallback={<p className="text-sm text-text-muted">Loading photos…</p>}>
                  <Attachments entityType="event" entityId={event.id} />
                </Suspense>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
