import { Suspense } from "react";
import Link from "next/link";
import type { MaintenanceDetail } from "@/lib/actions/maintenance";
import type { MentionUser } from "@/components/MentionTextarea";
import { listAttachmentsForEntity } from "@/lib/attachments/queries";
import { AttachmentsPanel } from "@/lib/attachments/AttachmentsPanel";
import { formatCents, formatDate } from "@/components/maintenance/format";
import { MaintenanceDeleteButton } from "@/components/maintenance/MaintenanceDeleteButton";
import {
  MaintenanceLinksPanel,
  MaintenanceTagsForm,
} from "@/components/maintenance/MaintenanceLinksTags";
import { MaintenanceMetadataForm } from "@/components/maintenance/MaintenanceMetadataForm";
import { MaintenanceNotesEditor } from "@/components/maintenance/MaintenanceNotesEditor";
import { MaintenanceRelatedPanel } from "@/components/maintenance/MaintenanceRelatedPanel";
import { MaintenanceRemindersPanel } from "@/components/maintenance/MaintenanceRemindersPanel";
import { MaintenanceTitleForm } from "@/components/maintenance/MaintenanceTitleForm";
import { HomeReferencesPanel } from "@/components/home/HomeReferencesPanel";

export async function MaintenanceDetailView({
  log,
  users = [],
}: {
  log: MaintenanceDetail;
  users?: MentionUser[];
}) {
  const attachments = await listAttachmentsForEntity("maintenance_log", log.id);
  const costLabel = formatCents(log.costCents);
  const subtitle = [log.category, log.company, costLabel].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/maintenance"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← All maintenance
        </Link>
        <MaintenanceTitleForm logId={log.id} title={log.title} />
        {subtitle ? <p className="text-sm text-text-muted">{subtitle}</p> : null}
        {(log.startedAt || log.completedAt) && (
          <p className="text-xs text-text-muted">
            {[
              log.startedAt && `Started ${formatDate(log.startedAt)}`,
              log.completedAt && `Completed ${formatDate(log.completedAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <MaintenanceMetadataForm log={log} />
        <div className="space-y-6">
          <MaintenanceTagsForm log={log} />
          <MaintenanceLinksPanel log={log} />
        </div>
      </div>

      <MaintenanceNotesEditor logId={log.id} initialNotes={log.notes} users={users} />

      <MaintenanceRemindersPanel
        maintenanceLogId={log.id}
        reminders={log.reminders}
        users={users}
      />

      <MaintenanceRelatedPanel log={log} />

      <HomeReferencesPanel targetType="maintenance_log" targetId={log.id} />

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading files…</p>}>
          <AttachmentsPanel
            entityType="maintenance_log"
            entityId={log.id}
            initialAttachments={attachments}
          />
        </Suspense>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <MaintenanceDeleteButton logId={log.id} />
      </section>
    </div>
  );
}
