import Link from "next/link";
import { RestaurantStatusChip } from "@/components/restaurants/RestaurantStatusChip";
import { getWantToTryPreview } from "@/lib/actions/restaurants";

export async function RestaurantsSection() {
  const items = await getWantToTryPreview(5);

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-text">Restaurants to try</h2>
        <Link
          href="/restaurants"
          className="text-sm font-medium text-accent transition-colors hover:text-accent/80"
        >
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No restaurants on the list yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((restaurant) => (
            <li key={restaurant.id}>
              <Link
                href={`/restaurants/${restaurant.id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent-soft/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{restaurant.name}</p>
                  {restaurant.neighborhood ? (
                    <p className="truncate text-xs text-text-muted">{restaurant.neighborhood}</p>
                  ) : null}
                </div>
                <RestaurantStatusChip status={restaurant.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
