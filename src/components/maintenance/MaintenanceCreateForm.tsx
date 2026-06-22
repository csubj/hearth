"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { useCreateDialogSuccess } from "@/components/ui/CreateDialog";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { createMaintenanceLog, type MaintenanceActionState } from "@/lib/actions/maintenance";

function ActionMessage({ state }: { state: MaintenanceActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  return null;
}

export function MaintenanceCreateForm({
  users = [],
  homeLinkSourceType,
  homeLinkSourceId,
}: {
  users?: MentionUser[];
  homeLinkSourceType?: string;
  homeLinkSourceId?: string;
}) {
  const [state, action, pending] = useActionState<MaintenanceActionState, FormData>(
    createMaintenanceLog,
    {},
  );
  useCreateDialogSuccess(Boolean(state.success));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="redirect" value="none" />
      {homeLinkSourceType && homeLinkSourceId ? (
        <>
          <input type="hidden" name="homeLinkSourceType" value={homeLinkSourceType} />
          <input type="hidden" name="homeLinkSourceId" value={homeLinkSourceId} />
        </>
      ) : null}
      <div>
        <label htmlFor="maintenance-title" className="block text-sm font-medium text-text">
          Title
        </label>
        <input
          id="maintenance-title"
          name="title"
          required
          placeholder="Annual HVAC service, gutter cleaning…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="maintenance-category" className="block text-sm font-medium text-text">
            Category
          </label>
          <input
            id="maintenance-category"
            name="category"
            placeholder="HVAC, Plumbing, Roofing…"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="maintenance-company" className="block text-sm font-medium text-text">
            Company / contractor
          </label>
          <input
            id="maintenance-company"
            name="company"
            placeholder="Who performed the work"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <MentionTextarea
        name="notes"
        users={users}
        rows={2}
        placeholder="Notes, warranty details, follow-up items… (optional)"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="min-w-20">
          {pending ? "Adding…" : "Add"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
