"use client";

import { useState } from "react";
import type { HomeTreeNode } from "@/lib/actions/home";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/Collapsible";
import { HomeTree } from "./HomeTree";

export function HomeLogTreeSidebar({ tree }: { tree: HomeTreeNode[] }) {
  const [open, setOpen] = useState(false);

  const treePanel = (
    <div className="max-h-[50vh] overflow-y-auto md:max-h-[calc(100vh-12rem)]">
      {tree.length > 0 ? (
        <HomeTree tree={tree} />
      ) : (
        <p className="px-2 py-3 text-sm text-text-muted">No spaces yet.</p>
      )}
    </div>
  );

  return (
    <>
      <div className="md:hidden">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text shadow-card">
            Browse spaces
            <span className="text-xs text-text-muted">{open ? "Hide" : "Show"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-lg border border-border bg-surface p-2 shadow-card">
            {treePanel}
          </CollapsibleContent>
        </Collapsible>
      </div>

      <aside className="hidden w-64 shrink-0 border-r border-border pr-4 md:block">
        <p className="mb-2 px-2 text-xs font-medium tracking-wide text-text-muted uppercase">
          Home Log
        </p>
        {treePanel}
      </aside>
    </>
  );
}
