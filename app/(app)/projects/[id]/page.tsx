import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Attachments } from "@/components/Attachments";
import { ProjectComponentsTable } from "@/components/projects/ProjectComponentsTable";
import { ProjectDeleteButton } from "@/components/projects/ProjectDeleteButton";
import { ProjectLinksPanel, ProjectTagsForm } from "@/components/projects/ProjectLinksTags";
import { ProjectNotesEditor } from "@/components/projects/ProjectNotesEditor";
import { ProjectPrioritySelector } from "@/components/projects/ProjectPrioritySelector";
import { ProjectStatusActions } from "@/components/projects/ProjectStatusActions";
import { ProjectStatusChip } from "@/components/projects/ProjectStatusChip";
import { ProjectTitleForm } from "@/components/projects/ProjectTitleForm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getProjectById } from "@/lib/actions/projects";
import { loadMentionUsers } from "@/lib/users/mention-users";
import { HomeReferencesPanel } from "@/components/home/HomeReferencesPanel";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, mentionUsers] = await Promise.all([getProjectById(id), loadMentionUsers()]);

  if (!project) {
    notFound();
  }

  const [updatedByUser] = await getDb()
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, project.updatedByUserId))
    .limit(1);

  const lastEditedBy = updatedByUser
    ? (updatedByUser.displayName ?? updatedByUser.username)
    : "Someone";

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
          <ProjectStatusChip status={project.status} />
          <ProjectPrioritySelector projectId={project.id} currentPriority={project.priority} />
        </div>
        <ProjectTitleForm projectId={project.id} title={project.title} />
        <p className="text-xs text-text-muted">
          Last edited by {lastEditedBy} · {project.updatedAt.toLocaleString()}
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <ProjectStatusActions projectId={project.id} currentStatus={project.status} />
      </section>

      <ProjectNotesEditor
        projectId={project.id}
        initialNotes={project.notes}
        users={mentionUsers}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectTagsForm project={project} />
        <ProjectLinksPanel project={project} />
      </div>

      <ProjectComponentsTable project={project} />

      <HomeReferencesPanel targetType="project" targetId={project.id} />

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading files…</p>}>
          <Attachments entityType="project" entityId={project.id} />
        </Suspense>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <ProjectDeleteButton projectId={project.id} />
      </section>
    </div>
  );
}
