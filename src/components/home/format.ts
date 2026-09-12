import type { HomeSpaceKind } from "@/db/schema/home";
import type { InventoryItemKind } from "@/db/schema/inventory";

export function spaceKindLabel(kind: HomeSpaceKind): string {
  const labels: Record<HomeSpaceKind, string> = {
    property: "Property",
    structure: "Structure",
    room: "Room",
    area: "Area",
  };
  return labels[kind] ?? kind;
}

export function itemKindLabel(kind: InventoryItemKind | null): string {
  if (!kind) {
    return "Uncategorized";
  }
  const labels: Record<InventoryItemKind, string> = {
    paint: "Paint",
    fixture: "Fixture",
    flooring: "Flooring",
    window_treatment: "Window Treatment",
    electrical: "Electrical",
    plumbing: "Plumbing",
    appliance: "Appliance",
    furniture: "Furniture",
    generic: "Other",
  };
  return labels[kind] ?? kind;
}

export function formatPurchasedDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
