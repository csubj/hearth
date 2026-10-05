/**
 * Property scope switcher (task 7.4, design D7) — server component.
 *
 * Loads the user's property places and current scope via the server-only
 * router client and renders the header select.
 */

import { serverClient } from "@/lib/orpc-server-client";
import { PropertySwitcherClient } from "./property-switcher-client";

export async function PropertySwitcher() {
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

  return (
    <PropertySwitcherClient
      properties={properties}
      currentScope={currentScope}
    />
  );
}
