/**
 * Places page (task 7.5) — server component.
 *
 * Loads the places tree via the server-only router client and renders the
 * interactive places client (tree, create/move, and rollup counts). Also
 * passes quick-create module metadata so members can create an entity in the
 * selected place (task 13.2 prefills the place).
 */

import { serverClient } from "@/lib/orpc-server-client";
import { allDefinitions } from "@/modules/definitions";
import { extractFields } from "@/lib/module-fields";
import { PlacesClient } from "./places-client";
import type { QuickCreateModule } from "@/components/quick-create-dialog";

export default async function PlacesPage() {
  let tree: Array<{
    id: string;
    title: string;
    kind: string;
    path: string;
    parentId: string | null;
  }> = [];
  let loadError: string | null = null;

  try {
    tree = (await serverClient.placesTree({})) as typeof tree;
  } catch {
    loadError = "Failed to load places.";
  }

  // Build quick-create module metadata (placeRule and fields for prefill).
  const modules: QuickCreateModule[] = allDefinitions()
    .filter((d) => d.type !== "place")
    .filter((d) => d.quickCreate.length > 0)
    .map((d) => ({
      type: d.type,
      singular: d.label.singular,
      plural: d.label.plural,
      icon: d.icon,
      placeRule: d.placeRule,
      fields: extractFields(d).filter((f) =>
        d.quickCreate.includes(f.key as never),
      ),
    }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Places</h1>
      {loadError ? (
        <p className="text-destructive">{loadError}</p>
      ) : (
        <PlacesClient initialTree={tree} createModules={modules} />
      )}
    </div>
  );
}
