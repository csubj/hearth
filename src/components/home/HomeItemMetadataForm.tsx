"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { HomeItem } from "@/db/schema/home";
import type { HomeItemKind } from "@/db/schema/home";
import { updateHomeItem, type HomeActionState } from "@/lib/actions/home";
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
  if (state.success) {
    return <p className="text-sm text-green-700">{state.success}</p>;
  }
  return null;
}

export function HomeItemMetadataForm({ item }: { item: HomeItem }) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(updateHomeItem, {});
  const [kind, setKind] = useState<HomeItemKind>(item.kind);
  const preset = ITEM_KIND_PRESETS[kind];

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Details</h2>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="id" value={item.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`item-name-${item.id}`} className="block text-sm font-medium text-text">
              Name
            </label>
            <input
              id={`item-name-${item.id}`}
              name="name"
              defaultValue={item.name}
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor={`item-kind-${item.id}`} className="block text-sm font-medium text-text">
              Category
            </label>
            <select
              id={`item-kind-${item.id}`}
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
            <label htmlFor={`item-mfr-${item.id}`} className="block text-sm font-medium text-text">
              Manufacturer
            </label>
            <input
              id={`item-mfr-${item.id}`}
              name="manufacturer"
              defaultValue={item.manufacturer ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}

        {(preset.fields.colorName || preset.fields.colorHex) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {preset.fields.colorName && (
              <div>
                <label
                  htmlFor={`item-colorname-${item.id}`}
                  className="block text-sm font-medium text-text"
                >
                  Color name
                </label>
                <input
                  id={`item-colorname-${item.id}`}
                  name="colorName"
                  defaultValue={item.colorName ?? ""}
                  placeholder="Chantilly Lace OC-65"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
            {preset.fields.colorHex && (
              <div>
                <label
                  htmlFor={`item-colorhex-${item.id}`}
                  className="block text-sm font-medium text-text"
                >
                  Hex color
                </label>
                <input
                  id={`item-colorhex-${item.id}`}
                  name="colorHex"
                  defaultValue={item.colorHex ?? ""}
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
                <label
                  htmlFor={`item-model-${item.id}`}
                  className="block text-sm font-medium text-text"
                >
                  Model #
                </label>
                <input
                  id={`item-model-${item.id}`}
                  name="modelNumber"
                  defaultValue={item.modelNumber ?? ""}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
            {preset.fields.serialNumber && (
              <div>
                <label
                  htmlFor={`item-serial-${item.id}`}
                  className="block text-sm font-medium text-text"
                >
                  Serial #
                </label>
                <input
                  id={`item-serial-${item.id}`}
                  name="serialNumber"
                  defaultValue={item.serialNumber ?? ""}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>
        )}

        {preset.fields.finish && (
          <div>
            <label
              htmlFor={`item-finish-${item.id}`}
              className="block text-sm font-medium text-text"
            >
              Finish
            </label>
            <input
              id={`item-finish-${item.id}`}
              name="finish"
              defaultValue={item.finish ?? ""}
              placeholder="Eggshell, Satin, Matte…"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}

        {preset.fields.productUrl && (
          <div>
            <label htmlFor={`item-url-${item.id}`} className="block text-sm font-medium text-text">
              Product URL
            </label>
            <input
              id={`item-url-${item.id}`}
              name="productUrl"
              type="url"
              defaultValue={item.productUrl ?? ""}
              placeholder="https://…"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <ActionMessage state={state} />
        </div>
      </form>
    </section>
  );
}
