import type { HomeItemKind } from "@/db/schema/home";

export type ItemFieldConfig = {
  manufacturer: boolean;
  modelNumber: boolean;
  serialNumber: boolean;
  colorName: boolean;
  colorHex: boolean;
  finish: boolean;
  productUrl: boolean;
  purchasedAt: boolean;
};

export type ItemKindPreset = {
  kind: HomeItemKind;
  label: string;
  /** Short label for display badges */
  shortLabel: string;
  /** Which optional fields are relevant for this kind */
  fields: ItemFieldConfig;
  /** Whether to render a color swatch (paint kinds) */
  showSwatch: boolean;
};

const allFields: ItemFieldConfig = {
  manufacturer: true,
  modelNumber: true,
  serialNumber: true,
  colorName: true,
  colorHex: true,
  finish: true,
  productUrl: true,
  purchasedAt: true,
};

const equipmentFields: ItemFieldConfig = {
  manufacturer: true,
  modelNumber: true,
  serialNumber: true,
  colorName: false,
  colorHex: false,
  finish: false,
  productUrl: true,
  purchasedAt: true,
};

const genericFields: ItemFieldConfig = {
  manufacturer: true,
  modelNumber: true,
  serialNumber: false,
  colorName: false,
  colorHex: false,
  finish: false,
  productUrl: true,
  purchasedAt: true,
};

export const ITEM_KIND_PRESETS: Record<HomeItemKind, ItemKindPreset> = {
  paint: {
    kind: "paint",
    label: "Paint",
    shortLabel: "Paint",
    fields: allFields,
    showSwatch: true,
  },
  appliance: {
    kind: "appliance",
    label: "Appliance",
    shortLabel: "Appliance",
    fields: equipmentFields,
    showSwatch: false,
  },
  electrical: {
    kind: "electrical",
    label: "Electrical",
    shortLabel: "Electrical",
    fields: equipmentFields,
    showSwatch: false,
  },
  plumbing: {
    kind: "plumbing",
    label: "Plumbing",
    shortLabel: "Plumbing",
    fields: equipmentFields,
    showSwatch: false,
  },
  fixture: {
    kind: "fixture",
    label: "Fixture",
    shortLabel: "Fixture",
    fields: { ...equipmentFields, finish: true },
    showSwatch: false,
  },
  flooring: {
    kind: "flooring",
    label: "Flooring",
    shortLabel: "Flooring",
    fields: { ...genericFields, colorName: true, colorHex: false, finish: true },
    showSwatch: false,
  },
  window_treatment: {
    kind: "window_treatment",
    label: "Window Treatment",
    shortLabel: "Window",
    fields: genericFields,
    showSwatch: false,
  },
  generic: {
    kind: "generic",
    label: "Other",
    shortLabel: "Other",
    fields: genericFields,
    showSwatch: false,
  },
};

export function getItemKindPreset(kind: HomeItemKind): ItemKindPreset {
  return ITEM_KIND_PRESETS[kind];
}

/**
 * Normalize a hex color value to `#RRGGBB` format.
 * Accepts 3-char (#RGB) and 6-char (#RRGGBB) with or without the leading `#`.
 * Returns null if the value is not a valid hex color.
 */
export function normalizeColorHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const expanded = trimmed
      .split("")
      .map((c) => c + c)
      .join("");
    return `#${expanded.toUpperCase()}`;
  }
  return null;
}

/** Returns true if a raw color string is a valid hex color */
export function isValidColorHex(raw: string): boolean {
  return normalizeColorHex(raw) !== null;
}
