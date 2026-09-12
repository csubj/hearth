"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { useCreateDialogSuccess } from "@/components/ui/CreateDialog";
import { create, type InventoryActionState } from "@/lib/actions/inventory";
import { inventoryItemKinds } from "@/db/schema/inventory";
import { itemKindLabel } from "@/components/home/format";
import type { HomeSpaceSummary } from "@/lib/actions/home";

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
  spaces = [],
  initialSpaceId,
}: {
  homeLinkSourceType?: string;
  homeLinkSourceId?: string;
  spaces?: HomeSpaceSummary[];
  initialSpaceId?: string;
}) {
  const [state, action, pending] = useActionState<InventoryActionState, FormData>(create, {});
  useCreateDialogSuccess(Boolean(state.success));

  const defaultSpaceId =
    initialSpaceId ?? (homeLinkSourceType === "home_space" ? homeLinkSourceId : "");

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
        <label htmlFor="inventory-kind" className="block text-sm font-medium text-text">
          Kind
        </label>
        <select
          id="inventory-kind"
          name="kind"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Uncategorized</option>
          {inventoryItemKinds.map((kind) => (
            <option key={kind} value={kind}>
              {itemKindLabel(kind)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="inventory-space" className="block text-sm font-medium text-text">
          Space
        </label>
        <select
          id="inventory-space"
          name="spaceId"
          defaultValue={defaultSpaceId}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">No space</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
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
