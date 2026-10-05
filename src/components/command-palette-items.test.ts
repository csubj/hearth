/**
 * Tests for the command palette's pure item-building and keyboard
 * navigation logic (task 12.3).
 *
 * The palette is a browser component (Cmd/Ctrl-K, debounced search). Here we
 * verify the search-and-navigate behaviour at the item-model level: entity
 * results are listed with a navigable detail route, actions are offered
 * (create a module, go to a section, switch property), and keyboard
 * selection wraps correctly. Full browser behaviour is left to Playwright.
 */

import { describe, it, expect } from "vitest";
import {
  buildPaletteItems,
  moveSelection,
  itemHref,
  type EntityItem,
  type ActionItem,
} from "./command-palette-items";

const entities: EntityItem[] = [
  {
    kind: "entity",
    id: "e1",
    type: "notes-page",
    title: "Alabaster",
    snippet: "<mark>Alabaster</mark> powder",
    placeTitle: "Kitchen",
    href: "/notes-page/e1",
  },
];

const actions: ActionItem[] = [
  { kind: "action", id: "today", label: "Go to Today", href: "/" },
  { kind: "action", id: "new-note", label: "Create Household note", href: "/notes-page" },
  { kind: "action", id: "switch-main", label: "Switch to Main House", onSelect: () => {} },
];

describe("buildPaletteItems", () => {
  it("shows actions first when the query is empty", () => {
    const items = buildPaletteItems("", entities, actions);
    expect(items.every((i) => i.kind === "action")).toBe(true);
    expect(items.map((i) => i.id)).toEqual(["today", "new-note", "switch-main"]);
  });

  it("lists entity results before matching actions for a query", () => {
    const items = buildPaletteItems("alab", entities, actions);
    expect(items[0]!.kind).toBe("entity");
    expect((items[0] as EntityItem).id).toBe("e1");
  });

  it("filters actions by query and keeps entity results regardless", () => {
    const items = buildPaletteItems("alab", entities, actions);
    // The create-note action matches 'alab'? It does not, so only Today is
    // filtered out of the actions for the query "alab". No action matches.
    const actionIds = items.filter((i) => i.kind === "action").map((i) => i.id);
    expect(actionIds).toEqual([]);
  });

  it("includes a matching action alongside entity results", () => {
    const items = buildPaletteItems("main", entities, actions);
    const actionIds = items.filter((i) => i.kind === "action").map((i) => i.id);
    expect(actionIds).toContain("switch-main");
    expect(items.map((i) => i.id)).toContain("e1");
  });
});

describe("itemHref", () => {
  it("returns the entity detail route", () => {
    expect(itemHref(entities[0]!)).toBe("/notes-page/e1");
  });

  it("returns the module list route for a create action", () => {
    expect(itemHref(actions[1]!)).toBe("/notes-page");
  });

  it("returns null for an action without a route", () => {
    expect(itemHref(actions[2]!)).toBeNull();
  });
});

describe("moveSelection", () => {
  it("returns -1 when there are no items", () => {
    expect(moveSelection(-1, 0, 1)).toBe(-1);
  });

  it("moves forward and wraps around", () => {
    expect(moveSelection(0, 3, 1)).toBe(1);
    expect(moveSelection(2, 3, 1)).toBe(0);
  });

  it("moves backward and wraps around", () => {
    expect(moveSelection(0, 3, -1)).toBe(2);
    expect(moveSelection(2, 3, -1)).toBe(1);
  });

  it("starts at the top when nothing is selected and moving down", () => {
    expect(moveSelection(-1, 3, 1)).toBe(0);
  });

  it("starts at the bottom when nothing is selected and moving up", () => {
    expect(moveSelection(-1, 3, -1)).toBe(2);
  });
});
