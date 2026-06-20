"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { deleteMaintenanceLog, type MaintenanceActionState } from "@/lib/actions/maintenance";

export function MaintenanceDeleteButton({ logId }: { logId: string }) {
  const [state, action, pending] = useActionState<MaintenanceActionState, FormData>(
    deleteMaintenanceLog,
    {},
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={logId} />
      <Button
        type="submit"
        disabled={pending}
        className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      >
        {pending ? "Deleting…" : "Delete maintenance log"}
      </Button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
