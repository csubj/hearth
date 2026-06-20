"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { updateHomeSpace, type HomeActionState } from "@/lib/actions/home";

export function HomeSpaceTitleForm({ spaceId, name }: { spaceId: string; name: string }) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(updateHomeSpace, {});

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={spaceId} />
      <input
        name="name"
        defaultValue={name}
        required
        className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold text-text transition-colors hover:border-border focus:border-border focus:outline-none"
      />
      <Button type="submit" disabled={pending} className="text-xs">
        {pending ? "Saving…" : "Rename"}
      </Button>
      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
