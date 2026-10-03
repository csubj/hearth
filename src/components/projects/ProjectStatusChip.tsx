import type { ProjectStatus } from "@/db/schema";

const statusStyles: Record<ProjectStatus, string> = {
  idea: "border-border text-text-muted",
  in_progress: "border-accent/30 text-accent",
  done: "border-success/40 text-success",
};

const statusLabels: Record<ProjectStatus, string> = {
  idea: "Idea",
  in_progress: "In progress",
  done: "Done",
};

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-xs uppercase tracking-[0.1em] ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export function projectStatusLabel(status: ProjectStatus): string {
  return statusLabels[status];
}