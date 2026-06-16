import Link from "next/link";
import { getTrackersHomeSummary } from "@/lib/actions/trackers";

function formatRecordedAt(date: Date): string {
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

export async function TrackersSection() {
  const items = await getTrackersHomeSummary();

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-text">Trackers</h2>
        <Link
          href="/trackers"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No trackers yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/trackers/${item.id}`}
                className="block rounded-md px-2 py-2 transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-text">{item.name}</span>
                  {item.stale ? (
                    <span className="shrink-0 text-xs font-medium text-accent">Stale</span>
                  ) : null}
                </div>
                {item.latestEntry ? (
                  <p className="mt-0.5 text-sm text-text-muted">
                    {formatValue(item.latestEntry.value, item.unit)} ·{" "}
                    {formatRecordedAt(item.latestEntry.recordedAt)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-text-muted">No entries yet</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
