"use client";

import { useActionState } from "react";
import type { MentionUser } from "@/components/MentionTextarea";
import { MentionTextarea } from "@/components/MentionTextarea";
import { Button } from "@/components/ui/Button";
import type { InventoryDetail } from "@/lib/actions/inventory";
import { update, type InventoryActionState } from "@/lib/actions/inventory";

function ActionMessage({ state }: { state: InventoryActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-sm text-green-700">{state.success}</p>;
  }
  return null;
}

function toDateInputValue(date: Date | null): string {
  if (!date) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function UpdateInventoryForm({
  item,
  users = [],
}: {
  item: InventoryDetail;
  users?: MentionUser[];
}) {
  const [state, action, pending] = useActionState<InventoryActionState, FormData>(update, {});

  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Details</h2>
      <input type="hidden" name="id" value={item.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="edit-name" className="block text-sm font-medium text-text">
            Name
          </label>
          <input
            id="edit-name"
            name="name"
            required
            defaultValue={item.name}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-brand" className="block text-sm font-medium text-text">
            Brand
          </label>
          <input
            id="edit-brand"
            name="brand"
            defaultValue={item.brand ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-model" className="block text-sm font-medium text-text">
            Model
          </label>
          <input
            id="edit-model"
            name="model"
            defaultValue={item.model ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-serial" className="block text-sm font-medium text-text">
            Serial
          </label>
          <input
            id="edit-serial"
            name="serial"
            defaultValue={item.serial ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-type" className="block text-sm font-medium text-text">
            Type
          </label>
          <input
            id="edit-type"
            name="itemType"
            defaultValue={item.itemType ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-location" className="block text-sm font-medium text-text">
            Location
          </label>
          <input
            id="edit-location"
            name="location"
            defaultValue={item.location ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-purchase-date" className="block text-sm font-medium text-text">
            Purchase date
          </label>
          <input
            id="edit-purchase-date"
            name="purchaseDate"
            type="date"
            defaultValue={toDateInputValue(item.purchaseDate)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-store" className="block text-sm font-medium text-text">
            Store
          </label>
          <input
            id="edit-store"
            name="store"
            defaultValue={item.store ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="edit-price" className="block text-sm font-medium text-text">
            Price
          </label>
          <input
            id="edit-price"
            name="price"
            defaultValue={item.price ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit-warranty" className="block text-sm font-medium text-text">
            Warranty
          </label>
          <input
            id="edit-warranty"
            name="warrantyNote"
            defaultValue={item.warrantyNote ?? ""}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="edit-notes" className="block text-sm font-medium text-text">
            Notes
          </label>
          <MentionTextarea
            id="edit-notes"
            name="notes"
            users={users}
            rows={3}
            defaultValue={item.notes ?? ""}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
