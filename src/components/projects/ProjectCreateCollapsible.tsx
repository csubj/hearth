"use client";

import { useState } from "react";
import { ProjectCreateForm } from "@/components/projects/ProjectCreateForm";
import { Button } from "@/components/ui/Button";
import type { MentionUser } from "@/components/MentionTextarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/Collapsible";

export function ProjectCreateCollapsible({ users }: { users: MentionUser[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" className="shrink-0">
          New project
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card">
        <ProjectCreateForm users={users} />
      </CollapsibleContent>
    </Collapsible>
  );
}
