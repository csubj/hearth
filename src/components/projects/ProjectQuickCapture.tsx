"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { create, type ProjectActionState } from "@/lib/actions/projects";

function ActionMessage({ state }: { state: ProjectActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-sm text-success">{state.success}</p>;
  }
  return null;
}

export function ProjectQuickCapture({
  users = [],
  redirect = "detail",
}: {
  users?: MentionUser[];
  redirect?: "detail" | "none";
}) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(create, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="redirect" value={redirect} />
      <div>
        <label htmlFor="quick-title" className="block text-sm font-medium text-text">
          Title <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <input
          id="quick-title"
          name="title"
          placeholder="Fix garage door"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="quick-notes" className="block text-sm font-medium text-text">
          Notes
        </label>
        <MentionTextarea
          id="quick-notes"
          name="notes"
          users={users}
          rows={3}
          placeholder="What needs doing? @mention someone…"
          className="mt-1"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add project"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
