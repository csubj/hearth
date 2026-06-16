import Link from "next/link";
import { eq, gte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ProjectStatusChip } from "@/components/projects/ProjectStatusChip";

const HOME_LIMIT = 5;
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export async function ProjectsSection() {
  const recentCutoff = new Date(Date.now() - RECENT_MS);
  const rows = await getDb()
    .select()
    .from(projects)
    .where(or(eq(projects.status, "in_progress"), gte(projects.updatedAt, recentCutoff)));

  const filtered = rows
    .sort((a, b) => {
      if (a.status === "in_progress" && b.status !== "in_progress") return -1;
      if (b.status === "in_progress" && a.status !== "in_progress") return 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, HOME_LIMIT);

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg text-text">Projects</h2>
          <p className="text-sm text-text-muted">In progress & recently touched</p>
        </div>
        <Link
          href="/projects"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Nothing in progress right now.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent-soft/50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <span className="truncate text-sm font-medium text-text">{project.title}</span>
                <ProjectStatusChip status={project.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
