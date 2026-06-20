import type { MaintenanceListItem } from "@/lib/actions/maintenance";
import { MaintenanceCard } from "@/components/maintenance/MaintenanceCard";

export function MaintenanceList({ items }: { items: MaintenanceListItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">
        No maintenance logs yet. Log your first repair, service, or upkeep job above.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <MaintenanceCard log={item} />
        </li>
      ))}
    </ul>
  );
}
