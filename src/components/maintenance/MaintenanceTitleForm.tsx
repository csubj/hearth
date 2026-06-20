"use client";

import { useActionState } from "react";
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

export function MaintenanceTitleForm({ logId, title }: { logId: string; title: string }) {
  const [state, action, pending] = useActionState<MaintenanceActionState, FormData>(
    updateMaintenanceLog,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={logId} />
      <div className="min-w-0 flex-1">
        <label htmlFor="maintenance-title-edit" className="sr-only">
          Title
        </label>
        <input
          id="maintenance-title-edit"
          name="title"
          required
          defaultValue={title}
          className="w-full border-0 bg-transparent font-serif text-2xl text-text focus:ring-0"
        />
      </div>
      <Button type="submit" disabled={pending} className="text-sm">
        {pending ? "Saving…" : "Save title"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
