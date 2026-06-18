"use client";

import { useActionState } from "react";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { addEntry, type MetricActionState } from "@/lib/actions/metrics-mutations";

function defaultRecordedAtValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AddEntryForm({
  metricId,
  users = [],
}: {
  metricId: string;
  users?: MentionUser[];
}) {
  const [state, formAction, pending] = useActionState<MetricActionState, FormData>(addEntry, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="metricId" value={metricId} />
      <div>
        <label htmlFor="entry-value" className="block text-sm font-medium text-text">
          Value
        </label>
        <input
          id="entry-value"
          name="value"
          type="text"
          required
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>
      <div>
        <label htmlFor="entry-recorded-at" className="block text-sm font-medium text-text">
          Recorded at
        </label>
        <input
          id="entry-recorded-at"
          name="recordedAt"
          type="datetime-local"
          defaultValue={defaultRecordedAtValue()}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>
      <div>
        <label htmlFor="entry-note" className="block text-sm font-medium text-text">
          Note <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <MentionTextarea
          id="entry-note"
          name="note"
          users={users}
          rows={3}
          className="mt-1 text-sm"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success" role="status">
          Entry added.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add entry"}
      </button>
    </form>
  );
}
