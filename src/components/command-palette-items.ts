/**
 * Command palette item model and pure helpers (task 12.3).
 *
 * A palette shows a mixed list of search results (entities) and actions
 * (go to a section, create a module, switch property). This module keeps the
 * item building and keyboard-navigation selection in pure functions so they
 * can be unit tested without a DOM, mirroring how the palette behaves in the
 * browser.
 */

// ---------------------------------------------------------------------------
// Item model
// ---------------------------------------------------------------------------

/** A search result that jumps to an entity's detail page. */
export interface EntityItem {
  kind: "entity";
  id: string;
  type: string;
  title: string;
  snippet: string | null;
  placeTitle: string | null;
  /** The detail page route. */
  href: string;
}

/** An action offered by the palette (navigate or perform an in-app action). */
export interface ActionItem {
  kind: "action";
  id: string;
  label: string;
  hint?: string;
  /** A route to navigate to, when the action is a navigation. */
  href?: string;
  /** A callback for actions that mutate state (e.g. switching property). */
  onSelect?: () => void;
}

export type PaletteItem = EntityItem | ActionItem;

// ---------------------------------------------------------------------------
// Building items
// ---------------------------------------------------------------------------

/**
 * Build the ordered list of palette items for a query.
 *
 * When the query has text, entity search results are shown first (ordered by
 * relevance from the search procedure), followed by any actions whose label
 * contains the query (case-insensitive). When the query is empty, only the
 * actions are shown.
 */
export function buildPaletteItems(
  query: string,
  entities: EntityItem[],
  actions: ActionItem[],
): PaletteItem[] {
  const trimmed = query.trim().toLowerCase();

  if (trimmed === "") {
    return actions;
  }

  const items: PaletteItem[] = [];
  for (const entity of entities) {
    items.push(entity);
  }
  for (const action of actions) {
    if (action.label.toLowerCase().includes(trimmed)) {
      items.push(action);
    }
  }
  return items;
}

/**
 * Move the active index by `delta` (+1 / -1), wrapping around the list.
 * Returns -1 when there is nothing to select.
 *
 * This implements ArrowUp/ArrowDown behaviour in the palette.
 */
export function moveSelection(
  index: number,
  length: number,
  delta: number,
): number {
  if (length <= 0) return -1;
  if (index === -1) {
    // Nothing selected yet: start at the top for +1, the bottom for -1.
    return delta > 0 ? 0 : length - 1;
  }
  return (index + delta + length) % length;
}

/** Resolve the navigation target for an item, or null for a plain action. */
export function itemHref(item: PaletteItem): string | null {
  if (item.kind === "entity") return item.href;
  return item.href ?? null;
}
