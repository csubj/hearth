import Link from "next/link";
import type { MetricReminderUnit } from "@/db/schema";
import type { MetricListPageItem } from "@/lib/actions/metrics-list";
import { formatReminderInterval } from "@/lib/metrics/reminder-interval";

function formatRecordedAt(date: Date): string {
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

function cadenceLabel(item: MetricListPageItem): string | null {
  if (item.reminderIntervalCount == null || !item.reminderIntervalUnit) {
    return null;
  }
  const phrase = formatReminderInterval(
    item.reminderIntervalCount,
    item.reminderIntervalUnit as MetricReminderUnit,
    { prefixEvery: true },
  );
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function Trend({ item }: { item: MetricListPageItem }) {
  if (!item.latestEntry || !item.previousEntry) {
    return null;
  }
  const latest = Number(item.latestEntry.value);
  const previous = Number(item.previousEntry.value);
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) {
    return null;
  }
  const delta = latest - previous;
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const magnitude = Math.abs(delta);
  const formatted = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(2);
  return (
    <span>
      {arrow} {delta === 0 ? "no change" : `${formatted}${item.unit ? ` ${item.unit}` : ""}`}
    </span>
  );
}

export function MetricCard({ item }: { item: MetricListPageItem }) {
  const cadence = cadenceLabel(item);

  return (
    <Link
      href={`/metrics/${item.id}`}
      className="block rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-text">{item.name}</h2>
          {item.unit ? <p className="mt-0.5 text-xs text-text-muted">Unit: {item.unit}</p> : null}
        </div>
        {item.stale ? (
          <span className="rounded-full bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
            Needs update
          </span>
        ) : null}
      </div>
      {item.latestEntry ? (
        <p className="mt-2 text-sm text-text-muted">
          Latest:{" "}
          <span className="text-text">{formatValue(item.latestEntry.value, item.unit)}</span> on{" "}
          {formatRecordedAt(item.latestEntry.recordedAt)}
        </p>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No entries yet</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <Trend item={item} />
        <span>
          {item.entryCount} {item.entryCount === 1 ? "entry" : "entries"}
        </span>
        {cadence ? <span>{cadence}</span> : null}
      </div>
    </Link>
  );
}
