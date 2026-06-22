"use client";

import { useCallback } from "react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { InfiniteList } from "@/components/ui/InfiniteList";
import { listProjectsPage, type ProjectListItem } from "@/lib/actions/projects";

export function ProjectInfiniteList({
  initialItems,
  initialNextOffset,
  searchParams,
}: {
  initialItems: ProjectListItem[];
  initialNextOffset: number | null;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const loadMore = useCallback(
    (offset: number) => listProjectsPage(searchParams, offset),
    [searchParams],
  );

  return (
    <InfiniteList
      initialItems={initialItems}
      initialNextOffset={initialNextOffset}
      loadMore={loadMore}
      renderItem={(project) => <ProjectCard project={project} />}
      emptyState={
        <p className="text-sm text-text-muted">
          No projects match your filters. Use{" "}
          <span className="font-medium text-text">New project</span> above to get started.
        </p>
      }
    />
  );
}
