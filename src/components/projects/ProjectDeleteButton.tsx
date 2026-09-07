"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteProject, type ProjectActionState } from "@/lib/actions/projects";

export function ProjectDeleteButton({
  projectId,
  projectTitle,
  componentCount,
}: {
  projectId: string;
  projectTitle: string;
  componentCount?: number;
}) {
  const [state, action, pending] = useActionState<ProjectActionState, FormData>(deleteProject, {});

  return (
    <ConfirmDialog
      title={"Delete project"}
      description={`Delete "${projectTitle}"? This cannot be undone.`}
      onConfirm={() => {
        const fd = new FormData();
        fd.append("id", projectId);
        action(fd);
      }}
      confirming={pending}
    >
      {componentCount != null && componentCount > 0 && (
        <p className="text-sm text-text-muted">
          This project has {componentCount} component{componentCount === 1 ? "" : "s"} that will
          also be deleted.
        </p>
      )}
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
