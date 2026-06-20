"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { MaintenanceDetail } from "@/lib/actions/maintenance";
import {
  addMaintenanceLink,
  removeMaintenanceLink,
  setMaintenanceTags,
  type MaintenanceActionState,
} from "@/lib/actions/maintenance";

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

export function MaintenanceLinksPanel({ log }: { log: MaintenanceDetail }) {
  const [addState, addAction, addPending] = useActionState<MaintenanceActionState, FormData>(
    addMaintenanceLink,
    {},
  );
  const [removeState, removeAction, removePending] = useActionState<
    MaintenanceActionState,
    FormData
  >(removeMaintenanceLink, {});

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Links</h2>
      {log.links.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {log.links.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:text-accent/80"
              >
                {link.label}
              </a>
              <form action={removeAction}>
                <input type="hidden" name="linkId" value={link.id} />
                <input type="hidden" name="maintenanceLogId" value={log.id} />
                <button
                  type="submit"
                  disabled={removePending}
                  className="text-xs text-text-muted hover:text-red-600"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No links yet.</p>
      )}

      <form action={addAction} className="mt-4 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="maintenanceLogId" value={log.id} />
        <input
          name="label"
          required
          placeholder="Label"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          name="url"
          required
          type="url"
          placeholder="https://…"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={addPending}>
            Add link
          </Button>
          <ActionMessage state={addState} />
        </div>
      </form>
      <ActionMessage state={removeState} />
    </section>
  );
}

export function MaintenanceTagsForm({ log }: { log: MaintenanceDetail }) {
  const [state, action, pending] = useActionState<MaintenanceActionState, FormData>(
    setMaintenanceTags,
    {},
  );

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Tags</h2>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={log.id} />
        <input
          name="tags"
          defaultValue={log.tags.map((tag) => tag.name).join(", ")}
          placeholder="hvac, warranty, annual"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-text-muted">Comma-separated tags for search and filtering.</p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            Save tags
          </Button>
          <ActionMessage state={state} />
        </div>
      </form>
    </section>
  );
}
