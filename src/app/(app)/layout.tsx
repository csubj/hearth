import type { ReactNode } from "react";
import { serverClient } from "@/lib/orpc-server-client";
import { definitions, allDefinitions } from "@/modules/definitions";
import { extractFields } from "@/lib/module-fields";
import { AppShell, type AppShellNavModule } from "./app-shell";
import { CommandPaletteShell } from "./command-palette";
import { PropertySwitcher } from "./property-switcher";
import type { FieldDescriptor } from "@/lib/module-fields";

function isQuickCreateable(definition: (typeof definitions)[string]): boolean {
  return definition.quickCreate.length > 0;
}

// Build the nav module metadata + quick-create fields from the registry.
function buildModules(): Array<AppShellNavModule & { fields: FieldDescriptor[] }> {
  return allDefinitions().map((definition) => {
    const allFields = extractFields(definition);
    const quickFields = allFields.filter((f) =>
      definition.quickCreate.includes(f.key as never),
    );
    return {
      type: definition.type,
      singular: definition.label.singular,
      plural: definition.label.plural,
      icon: definition.icon,
      placeRule: definition.placeRule,
      quickCreate: isQuickCreateable(definition),
      fields: quickFields,
    };
  });
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const modules = buildModules();

  // Load the inbox count and admin flag for the shell.
  let inboxCount = 0;
  let isAdmin = false;
  try {
    const [countResult, meResult] = await Promise.all([
      serverClient.inboxCount({}),
      serverClient.me({}),
    ]);
    inboxCount = (countResult as { count: number }).count ?? 0;
    isAdmin = (meResult as { role?: string }).role === "admin";
  } catch {
    // Unauthenticated or an error — the proxy redirects anyway.
  }

  return (
    <AppShell
      modules={modules}
      isAdmin={isAdmin}
      inboxCount={inboxCount}
    >
      <div className="mb-6 flex items-center justify-end">
        <PropertySwitcher />
      </div>
      {children}
      <CommandPaletteShell />
    </AppShell>
  );
}
