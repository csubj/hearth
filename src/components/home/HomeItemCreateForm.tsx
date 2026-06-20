"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createHomeItem, type HomeActionState } from "@/lib/actions/home";
import type { HomeItemKind } from "@/db/schema/home";
import { ITEM_KIND_PRESETS } from "@/lib/home/item-presets";
import { itemKindLabel } from "./format";

const ITEM_KINDS: HomeItemKind[] = [
  "paint",
  "appliance",
  "electrical",
  "plumbing",
  "fixture",
  "flooring",
  "window_treatment",
  "generic",
];

function ActionMessage({ state }: { state: HomeActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  return null;
}

export function HomeItemCreateForm({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(createHomeItem, {});
  const [kind, setKind] = useState<HomeItemKind>("generic");
  const preset = ITEM_KIND_PRESETS[kind];

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <h2 className="text-sm font-medium text-text">Add an item</h2>
      <input type="hidden" name="spaceId" value={spaceId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="item-name" className="block text-sm font-medium text-text">
            Name
          </label>
          <input
            id="item-name"
            name="name"
            required
            placeholder="Wall paint, Refrigerator, Main breaker panel…"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="item-kind" className="block text-sm font-medium text-text">
            Category
          </label>
          <select
            id="item-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as HomeItemKind)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {itemKindLabel(k)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {preset.fields.manufacturer && (
        <div>
          <label htmlFor="item-manufacturer" className="block text-sm font-medium text-text">
            Manufacturer <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id="item-manufacturer"
            name="manufacturer"
            placeholder="Benjamin Moore, Whirlpool…"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      {(preset.fields.colorName || preset.fields.colorHex) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {preset.fields.colorName && (
            <div>
              <label htmlFor="item-color-name" className="block text-sm font-medium text-text">
                Color name <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                id="item-color-name"
                name="colorName"
                placeholder="Chantilly Lace OC-65"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          {preset.fields.colorHex && (
            <div>
              <label htmlFor="item-color-hex" className="block text-sm font-medium text-text">
                Hex color <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                id="item-color-hex"
                name="colorHex"
                placeholder="#F5F0E8"
                pattern="^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          )}
        </div>
      )}

      {(preset.fields.modelNumber || preset.fields.serialNumber) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {preset.fields.modelNumber && (
            <div>
              <label htmlFor="item-model" className="block text-sm font-medium text-text">
                Model # <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                id="item-model"
                name="modelNumber"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          {preset.fields.serialNumber && (
            <div>
              <label htmlFor="item-serial" className="block text-sm font-medium text-text">
                Serial # <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                id="item-serial"
                name="serialNumber"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {preset.fields.finish && (
        <div>
          <label htmlFor="item-finish" className="block text-sm font-medium text-text">
            Finish <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id="item-finish"
            name="finish"
            placeholder="Eggshell, Satin, Matte…"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="min-w-20">
          {pending ? "Adding…" : "Add item"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
