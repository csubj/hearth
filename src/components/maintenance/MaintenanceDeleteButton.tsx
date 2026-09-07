"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteMaintenanceLog, type MaintenanceActionState } from "@/lib/actions/maintenance";

export function MaintenanceDeleteButton({
  logId,
  logTitle,
  reminderCount,
}: {
  logId: string;
  logTitle: string;
  reminderCount?: number;
}) {
  const [state, action, pending] = useActionState<MaintenanceActionState, FormData>(
    deleteMaintenanceLog,
    {},
  );

  return (
    <ConfirmDialog
      title={"Delete maintenance log"}
      description={`Delete "${logTitle}"? This cannot be undone.`}
      onConfirm={() => {
        const fd = new FormData();
        fd.append("id", logId);
        action(fd);
      }}
      confirming={pending}
    >
      {reminderCount != null && reminderCount > 0 && (
        <p className="text-sm text-text-muted">
          This log has {reminderCount} reminder{reminderCount === 1 ? "" : "s"} that will also be
          deleted.
        </p>
      )}
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
