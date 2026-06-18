"use client";

import { useState } from "react";
import { CreateRestaurantForm } from "@/components/restaurants/CreateRestaurantForm";
import { Button } from "@/components/ui/Button";
import type { MentionUser } from "@/components/MentionTextarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible";

export function CreateRestaurantCollapsible({ users }: { users: MentionUser[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="secondary" className="shrink-0">
          Add restaurant
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <CreateRestaurantForm users={users} />
      </CollapsibleContent>
    </Collapsible>
  );
}
