import Link from "next/link";
import { getMetricsHomeStats, getMetricsHomeSummary } from "@/lib/actions/metrics";

function formatRecordedAt(date: Date): string {
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

export async function MetricsSection() {
  const [items, stats] = await Promise.all([getMetricsHomeSummary(), getMetricsHomeStats()]);

  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-lg text-text">Metrics</h2>
          <span className="text-xs uppercase tracking-[0.1em] text-text-muted">
            {stats.stale > 0 ? `${stats.stale} stale` : `${stats.total} tracked`}
          </span>
        </div>
        <Link
          href="/metrics"
          className="text-xs uppercase tracking-[0.1em] text-accent hover:text-accent/80 focus-visible:outline-none"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">No metrics yet.</p>
      ) : (
        <ul className="mt-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/metrics/${item.id}`}
                className="block border-b border-border py-2 transition-colors hover:text-accent focus-visible:outline-none"
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
