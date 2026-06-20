"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { MentionUser } from "@/components/MentionTextarea";
import { ReminderIntervalFields } from "@/components/reminders/ReminderIntervalFields";
import type { MaintenanceLogReminderWithMeta } from "@/lib/actions/maintenance-log-reminders";
import {
  completeMaintenanceLogReminder,
  createMaintenanceLogReminder,
  deleteMaintenanceLogReminder,
  updateMaintenanceLogReminder,
} from "@/lib/actions/maintenance-log-reminders-mutations";
import type { MaintenanceActionState } from "@/lib/actions/maintenance";
import { formatReminderInterval, hasReminderInterval } from "@/lib/reminders/interval";
import type { MaintenanceLogReminderUnit } from "@/db/schema/maintenance";

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

function formatScope(recipientUserId: string | null, users: MentionUser[]): string {
  if (!recipientUserId) {
    return "Whole household";
  }
  const user = users.find((entry) => entry.id === recipientUserId);
  return user ? (user.displayName ?? user.username) : "Assigned member";
}

function ReminderCard({
  reminder,
  maintenanceLogId,
  users,
}: {
  reminder: MaintenanceLogReminderWithMeta;
  maintenanceLogId: string;
  users: MentionUser[];
}) {
  const [completeState, completeAction, completePending] = useActionState<
    MaintenanceActionState,
    FormData
  >(completeMaintenanceLogReminder, {});
  const [deleteState, deleteAction, deletePending] = useActionState<
    MaintenanceActionState,
    FormData
  >(deleteMaintenanceLogReminder, {});
  const [updateState, updateAction, updatePending] = useActionState<
    MaintenanceActionState,
    FormData
  >(updateMaintenanceLogReminder, {});

  const intervalEnabled =
    reminder.reminderType === "interval" &&
    hasReminderInterval({
      reminderIntervalCount: reminder.reminderIntervalCount,
      reminderIntervalUnit: reminder.reminderIntervalUnit,
      lastReminderAt: reminder.lastReminderAt,
    });

  return (
    <li className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-text">{reminder.title}</h3>
          {reminder.reminderType === "interval" && intervalEnabled ? (
            <p className="mt-1 text-sm text-text-muted">
              Every{" "}
              {formatReminderInterval(
                reminder.reminderIntervalCount!,
                reminder.reminderIntervalUnit as MaintenanceLogReminderUnit,
              )}{" "}
              · {formatScope(reminder.reminderRecipientUserId, users)}
            </p>
          ) : reminder.reminderType === "one_time" && reminder.dueAt ? (
            <p className="mt-1 text-sm text-text-muted">
              Due {reminder.dueAt.toLocaleDateString(undefined, { dateStyle: "medium" })} ·{" "}
              {formatScope(reminder.reminderRecipientUserId, users)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-text-muted">Reminder</p>
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

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={completeAction}>
          <input type="hidden" name="reminderId" value={reminder.id} />
          <input type="hidden" name="maintenanceLogId" value={maintenanceLogId} />
          <Button type="submit" disabled={completePending} className="text-xs">
            Mark done
          </Button>
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="reminderId" value={reminder.id} />
          <input type="hidden" name="maintenanceLogId" value={maintenanceLogId} />
          <button
            type="submit"
            disabled={deletePending}
            className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-red-600"
          >
            Remove
          </button>
        </form>
      </div>
      <ActionMessage state={completeState} />
      <ActionMessage state={deleteState} />

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-accent">Edit reminder</summary>
        <form action={updateAction} className="mt-3 space-y-3">
          <input type="hidden" name="reminderId" value={reminder.id} />
          <input type="hidden" name="maintenanceLogId" value={maintenanceLogId} />
          <input
            name="title"
            required
            defaultValue={reminder.title}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            name="notes"
            rows={2}
            defaultValue={reminder.notes ?? ""}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            name="reminderType"
            defaultValue={reminder.reminderType}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="interval">Recurring interval</option>
            <option value="one_time">One-time due date</option>
          </select>
          <ReminderIntervalFields
            users={users}
            intervalCount={reminder.reminderIntervalCount}
            intervalUnit={reminder.reminderIntervalUnit ?? undefined}
            recipientUserId={reminder.reminderRecipientUserId}
          />
          <div>
            <label className="block text-sm text-text-muted">Due date (one-time)</label>
            <input
              name="dueAt"
              type="date"
              defaultValue={reminder.dueAt ? reminder.dueAt.toISOString().slice(0, 10) : ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={updatePending}>
            Save reminder
          </Button>
          <ActionMessage state={updateState} />
        </form>
      </details>
    </li>
  );
}

export function MaintenanceRemindersPanel({
  maintenanceLogId,
  reminders,
  users,
}: {
  maintenanceLogId: string;
  reminders: MaintenanceLogReminderWithMeta[];
  users: MentionUser[];
}) {
  const [createState, createAction, createPending] = useActionState<
    MaintenanceActionState,
    FormData
  >(createMaintenanceLogReminder, {});

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Follow-up reminders</h2>
      <p className="mt-1 text-sm text-text-muted">
        Schedule recurring upkeep or one-time follow-ups for this work.
      </p>

      {reminders.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {reminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              maintenanceLogId={maintenanceLogId}
              users={users}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">No follow-up reminders yet.</p>
      )}

      <form action={createAction} className="mt-4 space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-text">Add reminder</h3>
        <input type="hidden" name="maintenanceLogId" value={maintenanceLogId} />
        <input
          name="title"
          required
          placeholder="Re-inspect roof patch, schedule next service…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <textarea
          name="notes"
          rows={2}
          placeholder="Optional notes"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          name="reminderType"
          defaultValue="interval"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="interval">Recurring interval</option>
          <option value="one_time">One-time due date</option>
        </select>
        <ReminderIntervalFields users={users} />
        <div>
          <label className="block text-sm text-text-muted">Due date (one-time)</label>
          <input
            name="dueAt"
            type="date"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" disabled={createPending}>
          Add reminder
        </Button>
        <ActionMessage state={createState} />
      </form>
    </section>
  );
}
