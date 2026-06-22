"use client";

import { useActionState } from "react";
import { useCreateDialogSuccess } from "@/components/ui/CreateDialog";
import { MentionTextarea, type MentionUser } from "@/components/MentionTextarea";
import { create, type RestaurantActionState } from "@/lib/actions/restaurants";

export function CreateRestaurantForm({ users = [] }: { users?: MentionUser[] }) {
  const [state, formAction, pending] = useActionState<RestaurantActionState, FormData>(create, {});
  useCreateDialogSuccess(Boolean(state.success));

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="restaurant-name" className="block text-sm font-medium text-text">
            Name
          </label>
          <input
            id="restaurant-name"
            name="name"
            type="text"
            required
            placeholder="Restaurant name"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="restaurant-neighborhood" className="block text-sm font-medium text-text">
            Neighborhood
          </label>
          <input
            id="restaurant-neighborhood"
            name="neighborhood"
            type="text"
            placeholder="Optional"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="restaurant-address" className="block text-sm font-medium text-text">
            Address
          </label>
          <input
            id="restaurant-address"
            name="address"
            type="text"
            placeholder="Optional"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="restaurant-notes" className="block text-sm font-medium text-text">
            Notes
          </label>
          <MentionTextarea
            id="restaurant-notes"
            name="notes"
            users={users}
            rows={2}
            placeholder="Why we want to go…"
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
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
