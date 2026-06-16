"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { update, type ProjectActionState } from "@/lib/actions/projects";

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

export function ProjectDetailForm({
  project,
  users = [],
}: {
  project: { id: string; title: string; description: string | null };
  users?: MentionUser[];
}) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(update, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={project.id} />
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-text">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={project.title}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-text">
          Description
        </label>
        <MentionTextarea
          id="description"
          name="description"
          users={users}
          rows={5}
          defaultValue={project.description ?? ""}
          className="mt-1"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
