"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { useCreateDialogSuccess } from "@/components/ui/CreateDialog";
import { createHomeSpace, type HomeActionState, type HomeSpaceSummary } from "@/lib/actions/home";
import type { HomeSpaceKind } from "@/db/schema/home";
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
  return null;
}

export function HomeSpaceCreateForm({
  parentSpace,
  defaultKind = "property",
}: {
  parentSpace?: HomeSpaceSummary;
  defaultKind?: HomeSpaceKind;
}) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(createHomeSpace, {});
  useCreateDialogSuccess(Boolean(state.success));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="redirect" value="none" />
      {parentSpace && <input type="hidden" name="parentId" value={parentSpace.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="home-space-name" className="block text-sm font-medium text-text">
            Name
          </label>
          <input
            id="home-space-name"
            name="name"
            required
            placeholder={
              parentSpace ? "Garage, Primary bedroom, Kitchen…" : "Main house, Vacation cabin…"
            }
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="home-space-kind" className="block text-sm font-medium text-text">
            Type
          </label>
          <select
            id="home-space-kind"
            name="kind"
            defaultValue={defaultKind}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {SPACE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {spaceKindLabel(kind)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!parentSpace && (
        <div>
          <label htmlFor="home-space-address" className="block text-sm font-medium text-text">
            Address <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <input
            id="home-space-address"
            name="address"
            placeholder="123 Main St"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="min-w-20">
          {pending ? "Adding…" : "Add"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
