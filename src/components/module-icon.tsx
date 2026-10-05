"use client";

/**
 * Icon mapper (task 13.1).
 *
 * Module definitions declare a Lucide icon by name string. This maps those
 * names to the actual icon components for the sidebar / nav. Unknown or
 * missing names fall back to a generic file icon.
 */

import {
  FileText,
  MapPin,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "notebook-text": FileText,
  "map-pin": MapPin,
};

export function moduleIcon(name: string | undefined): LucideIcon {
  if (name && ICONS[name]) return ICONS[name]!;
  return FileText;
}
