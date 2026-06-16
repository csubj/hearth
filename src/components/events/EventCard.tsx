"use client";

import { useActionState, useState } from "react";
import type { Event } from "@/db/schema";
import { deleteEvent, updateEvent, type EventActionState } from "@/lib/actions/events";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { formatEventDate, toDatetimeLocalValue } from "@/components/events/format";

const inputClassName =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

export function EventCard({
  event,
  muted = false,
  users = [],
}: {
  event: Event;
  muted?: boolean;
  users?: MentionUser[];
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState<EventActionState, FormData>(
    updateEvent,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<EventActionState, FormData>(
    deleteEvent,
    {},
  );

  if (editing) {
    return (
      <article className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <form action={updateAction} className="space-y-3">
          <input type="hidden" name="eventId" value={event.id} />
          <div>
            <label className="block text-sm font-medium text-text">Title</label>
            <input
              name="title"
              type="text"
              required
              defaultValue={event.title}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text">Date & time</label>
            <input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={toDatetimeLocalValue(event.startsAt)}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text">Location</label>
            <input
              name="location"
              type="text"
              defaultValue={event.location ?? ""}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text">Link</label>
            <input
              name="link"
              type="url"
              defaultValue={event.link ?? ""}
              className={inputClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text">Note</label>
            <MentionTextarea
              name="note"
              users={users}
              rows={2}
              defaultValue={event.note ?? ""}
              className="mt-1 text-sm"
            />
          </div>
          {updateState.error ? (
            <p className="text-sm text-red-600" role="alert">
              {updateState.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={updatePending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {updatePending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-text-muted hover:bg-accent-soft"
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article
      className={`group rounded-lg border border-border bg-surface p-4 shadow-card ${muted ? "opacity-75" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium text-text ${muted ? "text-text-muted" : ""}`}>{event.title}</p>
          <p className="mt-1 text-sm text-text-muted">{formatEventDate(event.startsAt)}</p>
          {event.location ? <p className="mt-1 text-sm text-text-muted">{event.location}</p> : null}
          {event.link ? (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-accent hover:underline"
            >
              {event.link}
            </a>
          ) : null}
          {event.note ? <p className="mt-2 text-sm text-text">{event.note}</p> : null}
        </div>
        <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-sm text-text-muted hover:bg-accent-soft hover:text-text"
          >
            Edit
          </button>
          <form action={deleteAction}>
            <input type="hidden" name="eventId" value={event.id} />
            <button
              type="submit"
              disabled={deletePending}
              className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deletePending ? "…" : "Delete"}
            </button>
          </form>
        </div>
      </div>
      {deleteState.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {deleteState.error}
        </p>
      ) : null}
    </article>
  );
}
