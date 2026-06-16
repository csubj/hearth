import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectCreateCollapsible } from "@/components/projects/ProjectCreateCollapsible";
import type { ProjectListItem } from "@/components/projects/ProjectCard";
import { loadMentionUsers } from "@/lib/users/mention-users";

function toListItem(row: typeof projects.$inferSelect): ProjectListItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default async function ProjectsPage() {
  const [rows, mentionUsers] = await Promise.all([
    getDb().select().from(projects).orderBy(desc(projects.updatedAt)),
    loadMentionUsers(),
  ]);
  const items = rows.map(toListItem);

  const inProgress = items.filter((p) => p.status === "in_progress");
  const ideas = items.filter((p) => p.status === "idea");
  const done = items.filter((p) => p.status === "done");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Projects</h1>
          <p className="mt-1 text-sm text-text-muted">House projects — visibility, not velocity.</p>
        </div>
        <ProjectCreateCollapsible users={mentionUsers} />
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">
          No projects yet. Use <span className="font-medium text-text">New project</span> above to
          get started.
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
