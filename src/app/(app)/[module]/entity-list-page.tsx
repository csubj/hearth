"use client";

/**
 * Wrapper that renders the shared <EntityList> for a module and provides a
 * quick-create entry point. Create uses the global QuickCreateDialog scoped to
 * this module.
 */

import { useState } from "react";
import { EntityList, type EntityListProps } from "@/components/entity-list";
import { QuickCreateDialog } from "@/components/quick-create-dialog";

export function EntityListPage(props: EntityListProps & { quickCreateFields: string[] }) {
  const { moduleType, fields, quickCreateFields, label } = props;
  const [createOpen, setCreateOpen] = useState(false);

  const moduleForCreate = {
    type: moduleType,
    singular: label.singular,
    plural: label.plural,
    icon: undefined as string | undefined,
    placeRule: "optional" as string,
    fields: fields.filter((f) => quickCreateFields.includes(f.key)),
  };

  return (
    <>
      <EntityList
        {...props}
        renderCreate={() => (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="new-entity-btn"
          >
            New
          </button>
        )}
      />
      <QuickCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        modules={[moduleForCreate]}
      />
    </>
  );
}
