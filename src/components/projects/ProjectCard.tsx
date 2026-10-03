"use client";

import Link from "next/link";
import type { ProjectStatus } from "@/db/schema";
import type { ProjectListItem } from "@/lib/actions/projects";
import { formatCents, notesExcerpt } from "@/components/projects/format";
import { ProjectStatusChip } from "@/components/projects/ProjectStatusChip";

export type { ProjectListItem };

function PriorityBadge({ priority }: { priority: number | null }) {
  if (priority == null) {
    return null;
  }
  return (
    <span className="border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
      P{priority}
    </span>
  );
}

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const excerpt = notesExcerpt(project.notes);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block border-b border-border py-3 transition-colors hover:text-accent focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`font-medium ${project.status === "done" ? "text-text-muted line-through" : "text-text"}`}
            >
              {project.title}
            </h3>
            <PriorityBadge priority={project.priority} />
          </div>
          {project.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {project.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="border border-border px-2 py-0.5 text-xs text-text-muted"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <ProjectStatusChip status={project.status as ProjectStatus} />
      </div>
      {excerpt ? <p className="mt-2 line-clamp-2 text-sm text-text-muted">{excerpt}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        {project.targetWhen ? <span>by {project.targetWhen}</span> : null}
        {project.estimatedCostCents > 0 ? (
          <span>
            {formatCents(project.estimatedCostCents)} est.
            {project.budgetCents != null ? ` of ${formatCents(project.budgetCents)} budget` : ""}
          </span>
        ) : project.budgetCents != null ? (
          <span>{formatCents(project.budgetCents)} budget</span>
        ) : null}
        {project.componentCount > 0 ? (
          <span>
            {project.acquiredCount}/{project.componentCount} acquired
          </span>
        ) : null}
      </div>
    </Link>
  );
}
