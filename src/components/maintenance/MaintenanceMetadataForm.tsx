"use client";

import { useActionState } from "react";
import type { MaintenanceDetail } from "@/lib/actions/maintenance";
import { centsToDollarInput, formatDate } from "@/components/maintenance/format";
import { updateMaintenanceLog, type MaintenanceActionState } from "@/lib/actions/maintenance";
import { Button } from "@/components/ui/Button";

function ActionMessage({ state }: { state: MaintenanceActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-sm text-green-700">{state.success}</p>;
  }
  return null;
}

export function MaintenanceMetadataForm({ log }: { log: MaintenanceDetail }) {
  const [state, action, pending] = useActionState<MaintenanceActionState, FormData>(
    updateMaintenanceLog,
    {},
  );

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Details</h2>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={log.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="maintenance-edit-category" className="block text-sm text-text-muted">
              Category
            </label>
            <input
              id="maintenance-edit-category"
              name="category"
              defaultValue={log.category ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="maintenance-edit-company" className="block text-sm text-text-muted">
              Company
            </label>
            <input
              id="maintenance-edit-company"
              name="company"
              defaultValue={log.company ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="maintenance-edit-cost" className="block text-sm text-text-muted">
              Cost (USD)
            </label>
            <input
              id="maintenance-edit-cost"
              name="costCents"
              type="number"
              step="0.01"
              min="0"
              defaultValue={centsToDollarInput(log.costCents)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="maintenance-edit-started" className="block text-sm text-text-muted">
              Started
            </label>
            <input
              id="maintenance-edit-started"
              name="startedAt"
              type="date"
              defaultValue={log.startedAt ? log.startedAt.toISOString().slice(0, 10) : ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="maintenance-edit-completed" className="block text-sm text-text-muted">
              Completed
            </label>
            <input
              id="maintenance-edit-completed"
              name="completedAt"
              type="date"
              defaultValue={log.completedAt ? log.completedAt.toISOString().slice(0, 10) : ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </Button>
          <ActionMessage state={state} />
        </div>
      </form>
      <dl className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
        <div>
          <dt className="font-medium text-text">Created</dt>
          <dd>{formatDate(log.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-text">Updated</dt>
          <dd>{formatDate(log.updatedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}
