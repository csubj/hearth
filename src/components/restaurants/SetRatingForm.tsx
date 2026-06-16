"use client";

import { useActionState } from "react";
import type { Restaurant } from "@/db/schema";
import { StarRating } from "@/components/restaurants/StarRating";
import { setRating, type RestaurantActionState } from "@/lib/actions/restaurants";

export function SetRatingForm({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, pending] = useActionState<RestaurantActionState, FormData>(
    setRating,
    {},
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text">Rating</h2>
        <StarRating rating={restaurant.rating} />
      </div>
      <input type="hidden" name="id" value={restaurant.id} />
      <div>
        <label htmlFor="set-rating" className="block text-sm font-medium text-text">
          Update rating
        </label>
        <select
          id="set-rating"
          name="rating"
          required
          defaultValue={restaurant.rating ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <option value="" disabled>
            Select stars
          </option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} star{value === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success" role="status">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save rating"}
      </button>
    </form>
  );
}
