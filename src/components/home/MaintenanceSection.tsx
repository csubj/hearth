import Link from "next/link";
import { getMaintenanceHomeStats, getMaintenanceHomeSummary } from "@/lib/actions/maintenance";
import { formatCents, formatDate } from "@/components/maintenance/format";

export async function MaintenanceSection() {
  const [items, stats] = await Promise.all([
    getMaintenanceHomeSummary(),
    getMaintenanceHomeStats(),
  ]);

  return (
    <section className="rounded-lg border border-border bg-surface p-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-base text-text">Maintenance</h2>
          <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-text-muted">
            {stats.dueReminders > 0
              ? `${stats.dueReminders} follow-ups due`
              : `${stats.total} logs`}
          </span>
        </div>
        <Link
          href="/maintenance"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">No maintenance logs yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/maintenance/${item.id}`}
                className="block rounded-md px-2 py-1.5 transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-text">{item.title}</span>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.hasOverdueReminder ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                        Follow-up due
                      </span>
                    ) : null}
                    <span className="text-xs text-text-muted">{formatDate(item.updatedAt)}</span>
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-text-muted">
                  {[item.category, item.company, formatCents(item.costCents)]
                    .filter(Boolean)
                    .join(" · ") || "No details"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
