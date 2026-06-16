"use client";

import { useActionState } from "react";
import { MentionTextarea } from "@/components/MentionTextarea";
import type { Restaurant } from "@/db/schema";
import { update, type RestaurantActionState } from "@/lib/actions/restaurants";

export function UpdateRestaurantForm({ restaurant }: { restaurant: Restaurant }) {
  const [state, formAction, pending] = useActionState<RestaurantActionState, FormData>(update, {});

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <h2 className="text-sm font-medium text-text">Details</h2>
      <input type="hidden" name="id" value={restaurant.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="edit-name" className="block text-sm font-medium text-text">
            Name
          </label>
          <input
            id="edit-name"
            name="name"
            type="text"
            required
            defaultValue={restaurant.name}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="edit-neighborhood" className="block text-sm font-medium text-text">
            Neighborhood
          </label>
          <input
            id="edit-neighborhood"
            name="neighborhood"
            type="text"
            defaultValue={restaurant.neighborhood ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="edit-address" className="block text-sm font-medium text-text">
            Address
          </label>
          <input
            id="edit-address"
            name="address"
            type="text"
            defaultValue={restaurant.address ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit-notes" className="block text-sm font-medium text-text">
            Notes
          </label>
          <MentionTextarea
            id="edit-notes"
            name="notes"
            rows={3}
            defaultValue={restaurant.notes ?? ""}
            className="mt-1 text-sm"
          />
        </div>
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
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
