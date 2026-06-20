"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { HomeSpace } from "@/db/schema/home";
import type { HomeSpaceKind } from "@/db/schema/home";
import { updateHomeSpace, type HomeActionState } from "@/lib/actions/home";
import { spaceKindLabel } from "./format";

const SPACE_KINDS: HomeSpaceKind[] = ["property", "structure", "room", "area"];

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

export function HomeSpaceMetadataForm({ space }: { space: HomeSpace }) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(updateHomeSpace, {});

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium text-text">Details</h2>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="id" value={space.id} />
        <div>
          <label htmlFor={`space-kind-${space.id}`} className="block text-sm font-medium text-text">
            Type
          </label>
          <select
            id={`space-kind-${space.id}`}
            name="kind"
            defaultValue={space.kind}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {SPACE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {spaceKindLabel(kind)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`space-address-${space.id}`}
            className="block text-sm font-medium text-text"
          >
            Address <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id={`space-address-${space.id}`}
            name="address"
            defaultValue={space.address ?? ""}
            placeholder="123 Main St"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
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
