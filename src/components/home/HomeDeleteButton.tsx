"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { deleteHomeSpace, deleteHomeItem, type HomeActionState } from "@/lib/actions/home";

export function HomeSpaceDeleteButton({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(deleteHomeSpace, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={spaceId} />
      <Button
        type="submit"
        disabled={pending}
        className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      >
        {pending ? "Deleting…" : "Delete space"}
      </Button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function HomeItemDeleteButton({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(deleteHomeItem, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={itemId} />
      <Button
        type="submit"
        disabled={pending}
        className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      >
        {pending ? "Deleting…" : "Delete item"}
      </Button>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
