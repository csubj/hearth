"use client";

import Link from "next/link";
import type { MaintenanceListItem } from "@/lib/actions/maintenance";
import { formatCents, formatDate, notesExcerpt } from "@/components/maintenance/format";

export function MaintenanceCard({ log }: { log: MaintenanceListItem }) {
  const excerpt = notesExcerpt(log.notes);
  const costLabel = formatCents(log.costCents);
  const startedLabel = formatDate(log.startedAt);
  const completedLabel = formatDate(log.completedAt);

  return (
    <Link
      href={`/maintenance/${log.id}`}
      className="block rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40 hover:bg-accent-soft/30 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-text">{log.title}</h3>
            {log.category ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                {log.category}
              </span>
            ) : null}
            {log.hasOverdueReminder ? (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                Follow-up due
              </span>
            ) : null}
          </div>
          {log.company ? <p className="mt-1 text-sm text-text-muted">{log.company}</p> : null}
          {log.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {log.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full border border-border px-2 py-0.5 text-xs text-text-muted"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {excerpt ? <p className="mt-2 line-clamp-2 text-sm text-text-muted">{excerpt}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span>Updated {formatDate(log.updatedAt)}</span>
        {costLabel ? <span>{costLabel}</span> : null}
        {startedLabel ? <span>Started {startedLabel}</span> : null}
        {completedLabel ? <span>Completed {completedLabel}</span> : null}
      </div>
    </Link>
  );
}
