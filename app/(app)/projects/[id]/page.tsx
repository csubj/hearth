import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Attachments } from "@/components/Attachments";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ProjectDetailForm } from "@/components/projects/ProjectDetailForm";
import { ProjectStatusActions } from "@/components/projects/ProjectStatusActions";
import { ProjectStatusChip } from "@/components/projects/ProjectStatusChip";
import { loadMentionUsers } from "@/lib/users/mention-users";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [projectRow, mentionUsers] = await Promise.all([
    getDb().select().from(projects).where(eq(projects.id, id)).limit(1),
    loadMentionUsers(),
  ]);
  const [project] = projectRow;

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/projects"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← All projects
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl text-text">{project.title}</h1>
          <ProjectStatusChip status={project.status} />
        </div>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <ProjectStatusActions projectId={project.id} currentStatus={project.status} />
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-lg font-medium text-text">Details</h2>
        <div className="mt-4">
          <ProjectDetailForm
            project={{
              id: project.id,
              title: project.title,
              description: project.description,
            }}
            users={mentionUsers}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading photos…</p>}>
          <Attachments entityType="project" entityId={project.id} />
        </Suspense>
      </section>
    </div>
  );
}
