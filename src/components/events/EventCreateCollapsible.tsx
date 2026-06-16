"use client";

import { useState } from "react";
import { EventCreateForm } from "@/components/events/EventCreateForm";
import { Button } from "@/components/ui/Button";
import type { MentionUser } from "@/components/MentionTextarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/Collapsible";

export function EventCreateCollapsible({ users }: { users: MentionUser[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="shrink-0">
          Add event
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <EventCreateForm users={users} />
      </CollapsibleContent>
    </Collapsible>
  );
}
