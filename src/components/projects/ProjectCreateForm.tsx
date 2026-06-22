"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { useCreateDialogSuccess } from "@/components/ui/CreateDialog";
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
  return null;
}

export function ProjectCreateForm({
  users = [],
  homeLinkSourceType,
  homeLinkSourceId,
}: {
  users?: MentionUser[];
  homeLinkSourceType?: string;
  homeLinkSourceId?: string;
}) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(create, {});
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
        <label htmlFor="project-title" className="block text-sm font-medium text-text">
          Title <span className="font-normal text-text-muted">(optional if notes provided)</span>
        </label>
        <input
          id="project-title"
          name="title"
          placeholder="What are we working on?"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="project-notes" className="block text-sm font-medium text-text">
          Notes
        </label>
        <MentionTextarea
          id="project-notes"
          name="notes"
          users={users}
          rows={3}
          placeholder="Notes, materials, links… (optional)"
          className="mt-1"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="min-w-20">
          {pending ? "Adding…" : "Add project"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
