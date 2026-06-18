"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { MentionUser } from "@/components/MentionTextarea";
import { ReminderIntervalFields } from "@/components/reminders/ReminderIntervalFields";
import type { MaintenanceReminderWithLinks } from "@/lib/actions/inventory-maintenance";
import {
  addMaintenanceReminderLink,
  completeMaintenanceReminder,
  createMaintenanceReminder,
  deleteMaintenanceReminder,
  removeMaintenanceReminderLink,
  updateMaintenanceReminder,
} from "@/lib/actions/inventory-maintenance-mutations";
import type { InventoryActionState } from "@/lib/actions/inventory";
import { formatReminderInterval, hasReminderInterval } from "@/lib/reminders/interval";
import type { MaintenanceReminderUnit } from "@/db/schema/inventory";

function ActionMessage({ state }: { state: InventoryActionState }) {
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

function formatScope(
  recipientUserId: string | null,
  users: MentionUser[],
): string {
  if (!recipientUserId) {
    return "Whole household";
  }
  const user = users.find((entry) => entry.id === recipientUserId);
  return user ? (user.displayName ?? user.username) : "Assigned member";
}

function ReminderCard({
  reminder,
  inventoryItemId,
  users,
}: {
  reminder: MaintenanceReminderWithLinks;
  inventoryItemId: string;
  users: MentionUser[];
}) {
  const [completeState, completeAction, completePending] = useActionState<
    InventoryActionState,
    FormData
  >(completeMaintenanceReminder, {});
  const [deleteState, deleteAction, deletePending] = useActionState<
    InventoryActionState,
    FormData
  >(deleteMaintenanceReminder, {});
  const [updateState, updateAction, updatePending] = useActionState<
    InventoryActionState,
    FormData
  >(updateMaintenanceReminder, {});
  const [addLinkState, addLinkAction, addLinkPending] = useActionState<
    InventoryActionState,
    FormData
  >(addMaintenanceReminderLink, {});
  const [removeLinkState, removeLinkAction, removeLinkPending] = useActionState<
    InventoryActionState,
    FormData
  >(removeMaintenanceReminderLink, {});

  const intervalEnabled = hasReminderInterval({
    reminderIntervalCount: reminder.reminderIntervalCount,
    reminderIntervalUnit: reminder.reminderIntervalUnit,
    lastReminderAt: reminder.lastReminderAt,
  });

  return (
    <li className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-text">{reminder.title}</h3>
          {intervalEnabled ? (
            <p className="mt-1 text-sm text-text-muted">
              Every{" "}
              {formatReminderInterval(
                reminder.reminderIntervalCount!,
                reminder.reminderIntervalUnit as MaintenanceReminderUnit,
              )}{" "}
              · {formatScope(reminder.reminderRecipientUserId, users)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-text-muted">Reminders disabled</p>
          )}
        </div>
        {reminder.stale ? (
          <span className="rounded-full bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
            Due
          </span>
        ) : null}
      </div>

      {reminder.notes ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">{reminder.notes}</p>
      ) : null}

      {reminder.links.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {reminder.links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:text-accent/80"
              >
                {link.label}
              </a>
              <form action={removeLinkAction}>
                <input type="hidden" name="linkId" value={link.id} />
                <input type="hidden" name="reminderId" value={reminder.id} />
                <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
                <button
                  type="submit"
                  disabled={removeLinkPending}
                  className="text-xs text-text-muted hover:text-red-600"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={completeAction}>
          <input type="hidden" name="reminderId" value={reminder.id} />
          <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
          <Button type="submit" variant="ghost" disabled={completePending}>
            {completePending ? "Saving…" : "Mark done"}
          </Button>
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="reminderId" value={reminder.id} />
          <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
          <Button type="submit" variant="ghost" disabled={deletePending}>
            Delete
          </Button>
        </form>
      </div>
      <ActionMessage state={completeState} />
      <ActionMessage state={deleteState} />
      <ActionMessage state={removeLinkState} />

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-text">Edit reminder</summary>
        <form action={updateAction} className="mt-3 space-y-3">
          <input type="hidden" name="reminderId" value={reminder.id} />
          <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
          <div>
            <label className="block text-sm text-text-muted">Title</label>
            <input
              name="title"
              required
              defaultValue={reminder.title}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted">Notes</label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={reminder.notes ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <ReminderIntervalFields
            idPrefix={`edit-${reminder.id}`}
            intervalCount={reminder.reminderIntervalCount}
            intervalUnit={reminder.reminderIntervalUnit}
            recipientUserId={reminder.reminderRecipientUserId}
            users={users}
            description="Mark done to reset the interval from today."
          />
          <Button type="submit" disabled={updatePending}>
            {updatePending ? "Saving…" : "Save changes"}
          </Button>
          <ActionMessage state={updateState} />
        </form>
      </details>

      <form action={addLinkAction} className="mt-4 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="reminderId" value={reminder.id} />
        <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
        <input
          name="label"
          required
          placeholder="Link label"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          name="url"
          required
          type="url"
          placeholder="https://"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="sm:col-span-2">
          <Button type="submit" variant="ghost" disabled={addLinkPending}>
            Add link
          </Button>
          <ActionMessage state={addLinkState} />
        </div>
      </form>
    </li>
  );
}

export function MaintenanceRemindersPanel({
  inventoryItemId,
  reminders,
  users,
}: {
  inventoryItemId: string;
  reminders: MaintenanceReminderWithLinks[];
  users: MentionUser[];
}) {
  const [createState, createAction, createPending] = useActionState<
    InventoryActionState,
    FormData
  >(createMaintenanceReminder, {});

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Maintenance reminders</h2>
      <p className="mt-1 text-sm text-text-muted">
        Schedule recurring upkeep — filter changes, inspections, and other interval-based tasks.
      </p>

      {reminders.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {reminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              inventoryItemId={inventoryItemId}
              users={users}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">No maintenance reminders yet.</p>
      )}

      <form action={createAction} className="mt-6 space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-text">Add reminder</h3>
        <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
        <div>
          <label className="block text-sm text-text-muted">Title</label>
          <input
            name="title"
            required
            placeholder="Replace HVAC filter"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-text-muted">Notes (optional)</label>
          <textarea
            name="notes"
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <ReminderIntervalFields
          idPrefix="create-maintenance"
          users={users}
          description="Mark done when maintenance is complete to reset the interval."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            name="linkLabel"
            placeholder="Link label (optional)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            name="linkUrl"
            type="url"
            placeholder="https:// (optional)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" disabled={createPending}>
          {createPending ? "Adding…" : "Add reminder"}
        </Button>
        <ActionMessage state={createState} />
      </form>
    </section>
  );
}
