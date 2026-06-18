import { Suspense } from "react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectCreateCollapsible } from "@/components/projects/ProjectCreateCollapsible";
import { ProjectFilters } from "@/components/projects/ProjectFilters";
import { ProjectQuickCapture } from "@/components/projects/ProjectQuickCapture";
import type { ProjectListItem } from "@/lib/actions/projects";
import { listProjectTags, listProjects } from "@/lib/actions/projects";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const [items, tags, mentionUsers] = await Promise.all([
    listProjects(resolvedSearchParams),
    listProjectTags(),
    loadMentionUsers(),
  ]);

  const currentQ =
    typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q : undefined;
  const currentTag =
    typeof resolvedSearchParams.tag === "string" ? resolvedSearchParams.tag : undefined;
  const currentSort =
    typeof resolvedSearchParams.sort === "string" ? resolvedSearchParams.sort : undefined;

  const inProgress = items.filter((p) => p.status === "in_progress");
  const ideas = items.filter((p) => p.status === "idea");
  const done = items.filter((p) => p.status === "done");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Projects</h1>
          <p className="mt-1 text-sm text-text-muted">
            House projects — notes, costs, and files in one place.
          </p>
        </div>
        <ProjectCreateCollapsible users={mentionUsers} />
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-sm font-medium text-text">Quick capture</h2>
        <div className="mt-3">
          <ProjectQuickCapture users={mentionUsers} />
        </div>
      </section>

      <Suspense fallback={<p className="text-sm text-text-muted">Loading filters…</p>}>
        <ProjectFilters
          tags={tags}
          currentQ={currentQ}
          currentTag={currentTag}
          currentSort={currentSort}
        />
      </Suspense>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">
          No projects yet. Use quick capture or{" "}
          <span className="font-medium text-text">New project</span> above to get started.
        </p>
      ) : (
        <div className="space-y-8">
          {inProgress.length > 0 ? (
            <ProjectGroup title="In progress" projects={inProgress} />
          ) : null}
          {ideas.length > 0 ? <ProjectGroup title="Ideas" projects={ideas} /> : null}
          {done.length > 0 ? <ProjectGroup title="Done" projects={done} /> : null}
        </div>
      )}
    </div>
  );
}

function ProjectGroup({ title, projects: group }: { title: string; projects: ProjectListItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium tracking-wide text-text-muted uppercase">{title}</h2>
      <div className="grid gap-3">
        {group.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
