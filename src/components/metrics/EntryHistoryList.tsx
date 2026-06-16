import { Suspense } from "react";
import type { Metric, MetricEntry } from "@/db/schema";
import { Attachments } from "@/components/Attachments";

function formatRecordedAt(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

export function EntryHistoryList({
  metric,
  entries,
}: {
  metric: Metric;
  entries: MetricEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-text-muted">No entries yet. Add the first measurement above.</p>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-accent-soft/50 text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Recorded</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-text-muted">{formatRecordedAt(entry.recordedAt)}</td>
                <td className="px-4 py-3 font-medium text-text">
                  {formatValue(entry.value, metric.unit)}
                </td>
                <td className="px-4 py-3 text-text">
                  <div className="space-y-2">
                    <span>{entry.note ?? "—"}</span>
                    <Suspense fallback={<p className="text-xs text-text-muted">Loading photos…</p>}>
                      <Attachments entityType="metric_entry" entityId={entry.id} />
                    </Suspense>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-text">{formatValue(entry.value, metric.unit)}</p>
              <time className="shrink-0 text-xs text-text-muted">
                {formatRecordedAt(entry.recordedAt)}
              </time>
            </div>
            {entry.note ? <p className="mt-2 text-sm text-text-muted">{entry.note}</p> : null}
            <div className="mt-3 border-t border-border pt-3">
              <Suspense fallback={<p className="text-xs text-text-muted">Loading photos…</p>}>
                <Attachments entityType="metric_entry" entityId={entry.id} />
              </Suspense>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
