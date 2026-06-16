"use client";

import { useActionState } from "react";
import type { ProjectStatus } from "@/db/schema";
import { Button } from "@/components/ui/Button";
import { projectStatusLabel } from "@/components/projects/ProjectStatusChip";
import { setStatus, type ProjectActionState } from "@/lib/actions/projects";

const STATUS_OPTIONS: ProjectStatus[] = ["idea", "in_progress", "done"];

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

export function ProjectStatusActions({
  projectId,
  currentStatus,
}: {
  projectId: string;
  currentStatus: ProjectStatus;
}) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(setStatus, {});

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text">Status</p>
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((status) => (
          <form key={status} action={action}>
            <input type="hidden" name="id" value={projectId} />
            <input type="hidden" name="status" value={status} />
            <Button
              type="submit"
              variant={status === currentStatus ? "primary" : "ghost"}
              disabled={pending || status === currentStatus}
              className="text-sm"
            >
              {projectStatusLabel(status)}
            </Button>
          </form>
        ))}
      </div>
      <ActionMessage state={state} />
    </div>
  );
}
