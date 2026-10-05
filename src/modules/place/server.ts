/**
 * places module server (task 7.1, design D2/D7).
 *
 * The details table for the places module is the `places` extension table,
 * which holds `kind` and `path`. Places are managed through custom
 * procedures, so the generic CRUD procedures are skipped for this module.
 */

import "server-only";

import type { ModuleServer } from "../types";
import { places } from "../../db/schema/places";

export type PlaceDetailsTable = typeof places;

export const placeServer: ModuleServer<"place", PlaceDetailsTable> = {
  type: "place",
  detailsTable: places,

  searchText(details) {
    return details.kind ?? "";
  },

  summary(entity, details) {
    return {
      title: entity.title,
      kind: details.kind ?? null,
    };
  },
};
