"use client";

import { useActionState } from "react";
import { setPriority, type ProjectActionState } from "@/lib/actions/projects";

export function ProjectPrioritySelector({
  projectId,
  currentPriority,
}: {
  projectId: string;
  currentPriority: number | null;
}) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(setPriority, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={projectId} />
      <label htmlFor={`priority-${projectId}`} className="text-sm text-text-muted">
        Priority
      </label>
      <select
        id={`priority-${projectId}`}
        name="priority"
        defaultValue={currentPriority?.toString() ?? "unset"}
        disabled={pending}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
      >
        <option value="unset">Unset</option>
        <option value="5">5 — highest</option>
        <option value="4">4</option>
        <option value="3">3</option>
        <option value="2">2</option>
        <option value="1">1 — lowest</option>
      </select>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
