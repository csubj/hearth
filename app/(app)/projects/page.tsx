import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
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
      <header>
        <h1 className="font-serif text-2xl text-text">Projects</h1>
        <p className="mt-1 text-sm text-text-muted">House projects — visibility, not velocity.</p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <ProjectCreateForm users={mentionUsers} />
      </section>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">No projects yet. Add one above to get started.</p>
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
