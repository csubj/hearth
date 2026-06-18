import Link from "next/link";
import { CreateMetricCollapsible } from "@/components/metrics/CreateMetricCollapsible";
import { listMetricsWithLatest } from "@/lib/actions/metrics";
import { loadMentionUsers } from "@/lib/users/mention-users";

function formatRecordedAt(date: Date): string {
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

export default async function MetricsPage() {
  const [items, mentionUsers] = await Promise.all([listMetricsWithLatest(), loadMentionUsers()]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-text">Metrics</h1>
          <p className="mt-1 text-sm text-text-muted">
            Ongoing measurements and observations for the household.
          </p>
        </div>
        <CreateMetricCollapsible users={mentionUsers} />
      </header>

      <section className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-text-muted">
            No metrics yet. Use <span className="font-medium text-text">New metric</span> above to
            get started.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/metrics/${item.id}`}
                  className="block rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium text-text">{item.name}</h2>
                      {item.unit ? (
                        <p className="mt-0.5 text-xs text-text-muted">Unit: {item.unit}</p>
                      ) : null}
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
                      <span className="text-text">
                        {formatValue(item.latestEntry.value, item.unit)}
                      </span>{" "}
                      on {formatRecordedAt(item.latestEntry.recordedAt)}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-text-muted">No entries yet</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
