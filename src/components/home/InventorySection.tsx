import Link from "next/link";
import { getInventoryHomeSummary } from "@/lib/actions/inventory";

function formatUpdatedAt(date: Date): string {
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export async function InventorySection() {
  const items = await getInventoryHomeSummary();

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-text">Inventory</h2>
        <Link
          href="/inventory"
          className="text-sm font-medium text-accent hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No inventory items yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/inventory/${item.id}`}
                className="block rounded-md px-2 py-2 transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-text">{item.name}</span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {formatUpdatedAt(item.updatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-text-muted">
                  {[item.brand, item.model, item.location].filter(Boolean).join(" · ") ||
                    "No details"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
