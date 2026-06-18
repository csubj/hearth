import Link from "next/link";
import { ProjectQuickCapture } from "@/components/projects/ProjectQuickCapture";
import { ProjectStatusChip } from "@/components/projects/ProjectStatusChip";
import { formatCents } from "@/components/projects/format";
import { getProjectsHomeSummary } from "@/lib/actions/projects";
import { loadMentionUsers } from "@/lib/users/mention-users";

export async function ProjectsSection() {
  const [filtered, mentionUsers] = await Promise.all([
    getProjectsHomeSummary(5),
    loadMentionUsers(),
  ]);

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg text-text">Projects</h2>
          <p className="text-sm text-text-muted">High priority & in progress</p>
        </div>
        <Link
          href="/projects"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>

      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <ProjectQuickCapture users={mentionUsers} redirect="detail" />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Nothing active right now.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent-soft/50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <span className="truncate text-sm font-medium text-text">{project.title}</span>
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
