"use client";

import { useActionState } from "react";
import { createEvent, type EventActionState } from "@/lib/actions/events";
import { MentionTextarea } from "@/components/MentionTextarea";
import { defaultDatetimeLocalValue } from "@/components/events/format";

const inputClassName =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

export function EventCreateForm() {
  const [state, formAction, pending] = useActionState<EventActionState, FormData>(createEvent, {});

  return (
    <form
      action={formAction}
      className="rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <h2 className="text-sm font-medium text-text">Add event</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="event-title" className="block text-sm font-medium text-text">
            Title
          </label>
          <input
            id="event-title"
            name="title"
            type="text"
            required
            className={inputClassName}
            placeholder="Concert at the park"
          />
        </div>
        <div>
          <label htmlFor="event-starts-at" className="block text-sm font-medium text-text">
            Date & time
          </label>
          <input
            id="event-starts-at"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={defaultDatetimeLocalValue(1)}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="event-location" className="block text-sm font-medium text-text">
            Location
          </label>
          <input
            id="event-location"
            name="location"
            type="text"
            className={inputClassName}
            placeholder="Optional"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="event-link" className="block text-sm font-medium text-text">
            Link
          </label>
          <input
            id="event-link"
            name="link"
            type="url"
            className={inputClassName}
            placeholder="https://"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="event-note" className="block text-sm font-medium text-text">
            Note
          </label>
          <MentionTextarea
            id="event-note"
            name="note"
            rows={2}
            className="mt-1 text-sm"
            placeholder="Optional details"
          />
        </div>
      </div>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="mt-2 text-sm text-success" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
