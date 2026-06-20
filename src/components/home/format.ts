import type { HomeSpaceKind, HomeItemKind } from "@/db/schema/home";

export function spaceKindLabel(kind: HomeSpaceKind): string {
  const labels: Record<HomeSpaceKind, string> = {
    property: "Property",
    structure: "Structure",
    room: "Room",
    area: "Area",
  };
  return labels[kind] ?? kind;
}

export function itemKindLabel(kind: HomeItemKind): string {
  const labels: Record<HomeItemKind, string> = {
    paint: "Paint",
    appliance: "Appliance",
    electrical: "Electrical",
    plumbing: "Plumbing",
    fixture: "Fixture",
    flooring: "Flooring",
    window_treatment: "Window Treatment",
    generic: "Other",
  };
  return labels[kind] ?? kind;
}

export function formatPurchasedDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
