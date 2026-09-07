"use client";

import { useActionState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteHomeSpace, deleteHomeItem, type HomeActionState } from "@/lib/actions/home";

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

export function HomeSpaceDeleteButton({
  spaceId,
  spaceName,
  childrenCount,
  itemsCount,
}: {
  spaceId: string;
  spaceName: string;
  childrenCount?: number;
  itemsCount?: number;
}) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(deleteHomeSpace, {});

  const details: string[] = [];
  if (childrenCount != null && childrenCount > 0) {
    details.push(pluralize(childrenCount, "child space", "child spaces"));
  }
  if (itemsCount != null && itemsCount > 0) {
    details.push(pluralize(itemsCount, "item", "items"));
  }

  return (
    <ConfirmDialog
      title={"Delete space"}
      description={`Delete "${spaceName}"? This cannot be undone.`}
      onConfirm={() => {
        const fd = new FormData();
        fd.append("id", spaceId);
        action(fd);
      }}
      confirming={pending}
    >
      {details.length > 0 && (
        <p className="text-sm text-text-muted">This will also delete {details.join(" and ")}.</p>
      )}
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

export function HomeItemDeleteButton({
  itemId,
  itemName,
  spaceName,
}: {
  itemId: string;
  itemName: string;
  spaceName: string;
}) {
  const [state, action, pending] = useActionState<HomeActionState, FormData>(deleteHomeItem, {});

  return (
    <ConfirmDialog
      title={"Delete item"}
      description={`Delete "${itemName}" from ${spaceName}? This cannot be undone.`}
      onConfirm={() => {
        const fd = new FormData();
        fd.append("id", itemId);
        action(fd);
      }}
      confirming={pending}
    >
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
