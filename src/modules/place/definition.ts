/**
 * places module definition (task 7.1, design D2/D7).
 *
 * Places are entities of type 'place'. The `kind` field is stored in the
 * `places` extension table. `placeRule: hidden` because places are created
 * and moved through custom procedures (`src/server/procedures/places.ts`),
 * not the generic module create, and show no place field on their own form.
 */

import * as z from "zod";
import type { ModuleDefinition } from "../types";

const PLACE_KINDS = ["property", "structure", "room", "area"] as const;

export const placeFields = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters")
    .meta({ label: "Title" }),
  kind: z
    .enum(PLACE_KINDS)
    .meta({ label: "Kind" }),
});

export type PlaceFields = typeof placeFields;

export const placeDefinition: ModuleDefinition<"place", PlaceFields> = {
  type: "place",
  label: { singular: "Place", plural: "Places" },
  icon: "map-pin",
  fields: placeFields,
  listColumns: ["kind"],
  filters: ["kind"],
  sorts: {
    title: { table: "entities", column: "title" },
    kind: { table: "details", column: "kind" },
    createdAt: { table: "entities", column: "created_at" },
    updatedAt: { table: "entities", column: "updated_at" },
  },
  placeRule: "hidden",
  features: {},
  quickCreate: ["kind"],
};
