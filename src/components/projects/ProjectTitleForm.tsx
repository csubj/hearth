"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { updateTitle, type ProjectActionState } from "@/lib/actions/projects";

export function ProjectTitleForm({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(updateTitle, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={projectId} />
      <div className="min-w-0 flex-1">
        <label htmlFor="project-title" className="sr-only">
          Title
        </label>
        <input
          id="project-title"
          name="title"
          required
          defaultValue={title}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-lg font-medium"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save title"}
      </Button>
      {state.error ? (
        <p className="w-full text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
