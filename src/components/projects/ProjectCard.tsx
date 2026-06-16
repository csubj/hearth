"use client";

import Link from "next/link";
import type { ProjectStatus } from "@/db/schema";
import { ProjectStatusChip } from "@/components/projects/ProjectStatusChip";

export type ProjectListItem = {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  updatedAt: string;
};

export function ProjectCard({ project }: { project: ProjectListItem }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40 hover:bg-accent-soft/30 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-text">{project.title}</h3>
        <ProjectStatusChip status={project.status} />
      </div>
      {project.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-text-muted">{project.description}</p>
      ) : null}
      <p className="mt-2 text-xs text-text-muted">
        Updated {new Date(project.updatedAt).toLocaleDateString()}
      </p>
    </Link>
  );
}
