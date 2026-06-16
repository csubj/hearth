"use client";

import { useActionState } from "react";
import { createMetric, type MetricActionState } from "@/lib/actions/metrics-mutations";

export function CreateMetricForm() {
  const [state, formAction, pending] = useActionState<MetricActionState, FormData>(
    createMetric,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="metric-name" className="block text-sm font-medium text-text">
          Name
        </label>
        <input
          id="metric-name"
          name="name"
          type="text"
          required
          placeholder="Flora's weight"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>
      <div>
        <label htmlFor="metric-unit" className="block text-sm font-medium text-text">
          Unit <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <input
          id="metric-unit"
          name="unit"
          type="text"
          placeholder="lbs"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success" role="status">
          Metric created.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create metric"}
      </button>
    </form>
  );
}
