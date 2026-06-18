import Link from "next/link";
import { ProjectQuickCapture } from "@/components/projects/ProjectQuickCapture";
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
    <section className="rounded-lg border border-border bg-surface p-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-base text-text">Projects</h2>
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-text-muted">
              {stats.active} active
            </span>
          </div>
          <p className="text-xs text-text-muted">High priority & in progress</p>
        </div>
        <Link
          href="/projects"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>

      <div className="mt-3 rounded-md border border-border bg-background p-2">
        <ProjectQuickCapture users={mentionUsers} redirect="detail" />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nothing active right now.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {filtered.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent-soft/50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
