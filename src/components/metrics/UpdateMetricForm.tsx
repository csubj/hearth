"use client";

import { useActionState } from "react";
import { updateMetric, type MetricActionState } from "@/lib/actions/metrics-mutations";
import { ReminderIntervalFields } from "@/components/reminders/ReminderIntervalFields";
import type { Metric } from "@/db/schema";
import type { MentionUser } from "@/components/MentionTextarea";

export function UpdateMetricForm({
  metric,
  users = [],
}: {
  metric: Metric;
  users?: MentionUser[];
}) {
  const [state, formAction, pending] = useActionState<MetricActionState, FormData>(
    updateMetric,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="metricId" value={metric.id} />
      <div>
        <label htmlFor="update-metric-name" className="block text-sm font-medium text-text">
          Name
        </label>
        <input
          id="update-metric-name"
          name="name"
          type="text"
          required
          defaultValue={metric.name}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>
      <div>
        <label htmlFor="update-metric-unit" className="block text-sm font-medium text-text">
          Unit <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <input
          id="update-metric-unit"
          name="unit"
          type="text"
          defaultValue={metric.unit ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>
      <ReminderIntervalFields
        idPrefix="update-metric"
        intervalCount={metric.reminderIntervalCount}
        intervalUnit={metric.reminderIntervalUnit}
        recipientUserId={metric.reminderRecipientUserId}
        users={users}
        description="Stale metrics are flagged in the list and trigger in-app reminders on this schedule."
      />
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success" role="status">
          Metric updated.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
