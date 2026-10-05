/**
 * Command palette server shell (task 12.3).
 *
 * Loads the module definitions (for create actions) and the user's property
 * scope + properties (for switch-property actions) via the server-only
 * router client, and renders the client palette. Mounted globally by the app
 * layout so Cmd/Ctrl-K works everywhere.
 */

import { serverClient } from "@/lib/orpc-server-client";
import { definitions } from "@/modules/definitions";
import { CommandPalette } from "@/components/command-palette";

export async function CommandPaletteShell() {
  let properties: { id: string; title: string }[] = [];
  let currentScope: string | null = null;

  try {
    const [tree, prefs] = await Promise.all([
      serverClient.placesTree({}),
      serverClient.getPreferences({}),
    ]);
    properties = (
      tree as Array<{ id: string; title: string; kind: string }>
    )
      .filter((p) => p.kind === "property")
      .map((p) => ({ id: p.id, title: p.title }));
    currentScope = (prefs as { propertyScope: string | null }).propertyScope;
  } catch {
    // Not authenticated or an error — render nothing.
    return null;
  }

  const modules = Object.values(definitions).map((d) => ({
    type: d.type,
    singular: d.label.singular,
    plural: d.label.plural,
  }));

  return (
    <CommandPalette
      modules={modules}
      properties={properties}
      currentScope={currentScope}
    />
  );
}
