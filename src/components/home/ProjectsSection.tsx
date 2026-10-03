import Link from "next/link";
import { CreateDialog } from "@/components/ui/CreateDialog";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { ProjectStatusChip } from "@/components/projects/ProjectStatusChip";
import { formatCents } from "@/components/projects/format";
import { getProjectsHomeStats, getProjectsHomeSummary } from "@/lib/actions/projects";
import { loadMentionUsers } from "@/lib/users/mention-users";

export async function ProjectsSection() {
  const [filtered, mentionUsers, stats] = await Promise.all([
    getProjectsHomeSummary(5),
    loadMentionUsers(),
    getProjectsHomeStats(),
  ]);

  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-lg text-text">Projects</h2>
          <span className="text-xs uppercase tracking-[0.1em] text-text-muted">{stats.active} active</span>
        </div>
        <div className="flex items-center gap-3">
          <CreateDialog
            triggerLabel="New project"
            triggerVariant="secondary"
            triggerClassName="h-9 min-h-9 px-3 text-xs"
            title="New project"
            description="Capture a house project — notes, costs, and files in one place."
          >
            <ProjectCreateForm users={mentionUsers} />
          </CreateDialog>
          <Link
            href="/projects"
            className="text-xs uppercase tracking-[0.1em] text-accent hover:text-accent/80 focus-visible:outline-none"
          >
            View all
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nothing active right now.</p>
      ) : (
        <ul className="mt-3">
          {filtered.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between gap-3 border-b border-border py-2 transition-colors hover:text-accent focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <span
                    className={`truncate text-sm font-medium ${project.status === "done" ? "text-text-muted line-through" : "text-text"}`}
                  >
                    {project.title}
                  </span>
                  {project.estimatedCostCents > 0 ? (
                    <span className="ml-2 text-xs text-text-muted">
                      {formatCents(project.estimatedCostCents)} est.
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {project.priority != null ? (
                    <span className="text-xs text-accent">P{project.priority}</span>
                  ) : null}
                  <ProjectStatusChip status={project.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
