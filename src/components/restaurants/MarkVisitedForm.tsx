"use client";

import { useActionState } from "react";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import type { Restaurant } from "@/db/schema";
import { markVisited, type RestaurantActionState } from "@/lib/actions/restaurants";

export function MarkVisitedForm({
  restaurant,
  users = [],
}: {
  restaurant: Restaurant;
  users?: MentionUser[];
}) {
  const [state, formAction, pending] = useActionState<RestaurantActionState, FormData>(
    markVisited,
    {},
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <h2 className="text-sm font-medium text-text">Mark as visited</h2>
      <input type="hidden" name="id" value={restaurant.id} />
      <div>
        <label htmlFor="visit-rating" className="block text-sm font-medium text-text">
          Rating
        </label>
        <select
          id="visit-rating"
          name="rating"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <option value="">No rating yet</option>
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value} star{value === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="visit-note" className="block text-sm font-medium text-text">
          Visit note
        </label>
        <MentionTextarea
          id="visit-note"
          name="visitNote"
          users={users}
          rows={3}
          placeholder="How was it?"
          className="mt-1 text-sm"
        />
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
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark visited"}
      </button>
    </form>
  );
}
