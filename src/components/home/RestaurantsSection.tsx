import Link from "next/link";
import { RestaurantStatusChip } from "@/components/restaurants/RestaurantStatusChip";
import { getRestaurantsHomeStats, getWantToTryPreview } from "@/lib/actions/restaurants";

export async function RestaurantsSection() {
  const [items, stats] = await Promise.all([getWantToTryPreview(5), getRestaurantsHomeStats()]);

  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-lg text-text">Restaurants to try</h2>
          <span className="text-xs uppercase tracking-[0.1em] text-text-muted">{stats.wantToTry}</span>
        </div>
        <Link
          href="/restaurants"
          className="text-xs uppercase tracking-[0.1em] text-accent transition-colors hover:text-accent/80"
        >
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">No restaurants on the list yet.</p>
      ) : (
        <ul className="mt-2">
          {items.map((restaurant) => (
            <li key={restaurant.id}>
              <Link
                href={`/restaurants/${restaurant.id}`}
                className="flex items-center justify-between gap-3 border-b border-border py-2 transition-colors hover:text-accent"
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
