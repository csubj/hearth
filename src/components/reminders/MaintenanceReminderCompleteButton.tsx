"use client";

import { useActionState } from "react";
import { completeMaintenanceReminder } from "@/lib/actions/inventory-maintenance-mutations";
import type { InventoryActionState } from "@/lib/actions/inventory";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";

export function MaintenanceReminderCompleteButton({
  inventoryItemId,
  reminderId,
}: {
  inventoryItemId: string;
  reminderId: string;
}) {
  const [state, action, pending] = useActionState<InventoryActionState, FormData>(
    completeMaintenanceReminder,
    {},
  );

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
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
