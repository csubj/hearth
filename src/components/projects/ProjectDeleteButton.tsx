"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { deleteProject, type ProjectActionState } from "@/lib/actions/projects";

export function ProjectDeleteButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(deleteProject, {});

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Delete this project? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={projectId} />
      <Button type="submit" disabled={pending} className="border-red-200 text-red-700 hover:bg-red-50">
        {pending ? "Deleting…" : "Delete project"}
      </Button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
