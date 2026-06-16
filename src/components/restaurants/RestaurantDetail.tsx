import { Suspense } from "react";
import Link from "next/link";
import type { Restaurant } from "@/db/schema";
import { Attachments } from "@/components/Attachments";
import { MarkVisitedForm } from "@/components/restaurants/MarkVisitedForm";
import { RestaurantStatusChip } from "@/components/restaurants/RestaurantStatusChip";
import { SetRatingForm } from "@/components/restaurants/SetRatingForm";
import { StarRating } from "@/components/restaurants/StarRating";
import { UpdateRestaurantForm } from "@/components/restaurants/UpdateRestaurantForm";

function formatDate(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RestaurantDetail({ restaurant }: { restaurant: Restaurant }) {
  const location = restaurant.neighborhood ?? restaurant.address;
  const visitedLabel = formatDate(restaurant.visitedAt);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/restaurants"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Back to restaurants
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl text-text">{restaurant.name}</h1>
            {location ? <p className="mt-1 text-sm text-text-muted">{location}</p> : null}
          </div>
          <RestaurantStatusChip status={restaurant.status} />
        </div>
        {restaurant.status === "visited" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-muted">
            <StarRating rating={restaurant.rating} />
            {visitedLabel ? <span>Visited {visitedLabel}</span> : null}
          </div>
        ) : null}
        {restaurant.visitNote ? (
          <blockquote className="mt-4 rounded-lg border border-border bg-accent-soft/40 p-4 text-sm text-text">
            {restaurant.visitNote}
          </blockquote>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UpdateRestaurantForm restaurant={restaurant} />
        {restaurant.status === "want_to_try" ? (
          <MarkVisitedForm restaurant={restaurant} />
        ) : (
          <SetRatingForm restaurant={restaurant} />
        )}
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <Suspense fallback={<p className="text-sm text-text-muted">Loading photos…</p>}>
          <Attachments entityType="restaurant" entityId={restaurant.id} />
        </Suspense>
      </section>
    </div>
  );
}
