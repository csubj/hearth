/**
 * places module UI (task 7.1, design D2).
 *
 * No generic UI overrides — the places page (`app/(app)/places`) is a custom
 * dedicated page. This file exists so the three-file convention holds.
 */

import type { ModuleUI } from "../types";

export const placeUI: ModuleUI<"place"> = {
  type: "place",
};
