import type { ProjectStatus } from "@/db/schema";

const statusStyles: Record<ProjectStatus, string> = {
  idea: "border-border bg-surface text-text-muted",
  in_progress: "border-accent/30 bg-accent-soft text-accent",
  done: "border-success/30 bg-success/10 text-success",
};

const statusLabels: Record<ProjectStatus, string> = {
  idea: "Idea",
  in_progress: "In progress",
  done: "Done",
};

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export function projectStatusLabel(status: ProjectStatus): string {
  return statusLabels[status];
}
