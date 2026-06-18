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
  return null;
}

export function ProjectCreateForm({ users = [] }: { users?: MentionUser[] }) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(create, {});

  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="project-title" className="block text-sm font-medium text-text">
          New project
        </label>
        <input
          id="project-title"
          name="title"
          placeholder="What are we working on? (optional if notes provided)"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <MentionTextarea
        name="notes"
        users={users}
        rows={2}
        placeholder="Notes, materials, links… (optional)"
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
