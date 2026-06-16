import Link from "next/link";
import { CreateTrackerForm } from "@/components/trackers/CreateTrackerForm";
import { listTrackersWithLatest } from "@/lib/actions/trackers";

function formatRecordedAt(date: Date): string {
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatValue(value: string, unit: string | null): string {
  return unit ? `${value} ${unit}` : value;
}

export default async function TrackersPage() {
  const items = await listTrackersWithLatest();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl text-text">Trackers</h1>
        <p className="mt-1 text-sm text-text-muted">
          Ongoing measurements and observations for the household.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-lg font-medium text-text">New tracker</h2>
        <p className="mt-1 text-sm text-text-muted">
          Name a tracker and optionally set a display unit.
        </p>
        <div className="mt-4 max-w-md">
          <CreateTrackerForm />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-text">All trackers</h2>
        {items.length === 0 ? (
          <p className="text-sm text-text-muted">
            No trackers yet. Create one above to get started.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/trackers/${item.id}`}
                  className="block rounded-lg border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-text">{item.name}</h3>
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
