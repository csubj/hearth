"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { create, type InventoryActionState } from "@/lib/actions/inventory";

function ActionMessage({ state }: { state: InventoryActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  return null;
}

export function CreateInventoryForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<InventoryActionState, FormData>(create, {});

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Add item
      </Button>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-text">New inventory item</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-text-muted hover:text-text"
        >
          Cancel
        </button>
      </div>
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="inventory-name" className="block text-sm font-medium text-text">
            Name <span className="text-red-600">*</span>
          </label>
          <input
            id="inventory-name"
            name="name"
            required
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="inventory-brand" className="block text-sm font-medium text-text">
            Brand
          </label>
          <input
            id="inventory-brand"
            name="brand"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="inventory-model" className="block text-sm font-medium text-text">
            Model
          </label>
          <input
            id="inventory-model"
            name="model"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="inventory-serial" className="block text-sm font-medium text-text">
            Serial
          </label>
          <input
            id="inventory-serial"
            name="serial"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="inventory-type" className="block text-sm font-medium text-text">
            Type
          </label>
          <input
            id="inventory-type"
            name="itemType"
            placeholder="appliance, electronics…"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="inventory-location" className="block text-sm font-medium text-text">
            Location
          </label>
          <input
            id="inventory-location"
            name="location"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="inventory-purchase-date" className="block text-sm font-medium text-text">
            Purchase date
          </label>
          <input
            id="inventory-purchase-date"
            name="purchaseDate"
            type="date"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? "Saving…" : "Create"}
          </Button>
          <ActionMessage state={state} />
        </div>
      </form>
    </section>
  );
}
