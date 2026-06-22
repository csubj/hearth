"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { useCreateDialogSuccess } from "@/components/ui/CreateDialog";
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

export function InventoryCreateForm({
  homeLinkSourceType,
  homeLinkSourceId,
}: {
  homeLinkSourceType?: string;
  homeLinkSourceId?: string;
}) {
  const [state, action, pending] = useActionState<InventoryActionState, FormData>(create, {});
  useCreateDialogSuccess(Boolean(state.success));

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="redirect" value="none" />
      {homeLinkSourceType && homeLinkSourceId ? (
        <>
          <input type="hidden" name="homeLinkSourceType" value={homeLinkSourceType} />
          <input type="hidden" name="homeLinkSourceId" value={homeLinkSourceId} />
        </>
      ) : null}
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
  );
}
