"use client";

import { useActionState } from "react";
import { completeMaintenanceLogReminder } from "@/lib/actions/maintenance-log-reminders-mutations";
import type { MaintenanceActionState } from "@/lib/actions/maintenance";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";

export function MaintenanceLogReminderCompleteButton({
  maintenanceLogId,
  reminderId,
}: {
  maintenanceLogId: string;
  reminderId: string;
}) {
  const [state, action, pending] = useActionState<MaintenanceActionState, FormData>(
    completeMaintenanceLogReminder,
    {},
  );

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="maintenanceLogId" value={maintenanceLogId} />
      <input type="hidden" name="reminderId" value={reminderId} />
      <FormSubmitButton
        pendingLabel="Saving…"
        className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-text transition-colors hover:bg-accent-soft disabled:opacity-50"
        disabled={pending}
      >
        Mark done
      </FormSubmitButton>
      {state.error ? (
        <span className="sr-only" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
