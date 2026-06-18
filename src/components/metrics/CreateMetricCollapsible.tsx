"use client";

import { useState } from "react";
import { CreateMetricForm } from "@/components/metrics/CreateMetricForm";
import type { MentionUser } from "@/components/MentionTextarea";
import { Button } from "@/components/ui/Button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/Collapsible";

export function CreateMetricCollapsible({ users = [] }: { users?: MentionUser[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="shrink-0">
          New metric
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="text-sm font-medium text-text">New metric</h2>
        <p className="mt-1 text-sm text-text-muted">
          Name a metric and optionally set a display unit.
        </p>
        <div className="mt-4 max-w-md">
          <CreateMetricForm users={users} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
