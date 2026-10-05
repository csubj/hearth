"use client";

/**
 * Pin/unpin button for an entity detail page (task 13.4).
 *
 * Reads the current pin state via `entityIsPinned` and toggles it through
 * `entityPin` / `entityUnpin`. Each member's pins are personal.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { Pin } from "lucide-react";
import { invoke } from "@/lib/actions/invoke";
import { Button } from "@/components/ui/button";

export function PinButton({ entityId }: { entityId: string }) {
  const [pinned, setPinned] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [, data] = await invoke("entityIsPinned", { id: entityId });
      if (cancelled) return;
      setPinned((data as { pinned: boolean } | undefined)?.pinned ?? false);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  const toggle = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    startTransition(async () => {
      const procKey = next ? "entityPin" : "entityUnpin";
      await invoke(procKey, { id: entityId });
    });
  }, [pinned, entityId]);

  if (!loaded) return null;

  return (
    <Button
      variant="outline"
      onClick={toggle}
      disabled={isPending}
      className="min-h-[36px]"
      data-testid="pin-btn"
    >
      <Pin className="size-4" />
      {pinned ? "Unpin" : "Pin"}
    </Button>
  );
}
