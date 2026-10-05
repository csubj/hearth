/**
 * Module procedure generator (task 6.2, design D2/D3/D13/D16).
 *
 * For each module in the registry, generates oRPC procedures:
 *   list, get, create, update, archive, unarchive, delete, restore
 *
 * All are wrapped in `member` middleware and route writes through write().
 * Cursor pagination per D16; expectedVersion conflict per D13.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";

import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { db } from "../../db";
import { entities } from "../../db/schema/entities";
import { buildScopeFilter } from "../scope";
import type { AnyModuleRecord, ModuleDefinition, ModuleFeatures } from "../../modules/types";

// Re-export for router registration
export type ModuleProcedures = ReturnType<typeof generateModuleProcedures>;

// ---------------------------------------------------------------------------
// Cursor encoding / decoding (D16)
// ---------------------------------------------------------------------------

interface CursorPayload {
  /** Sort field name that was active when this cursor was created. */
  sort: string;
  /** The last value of the sort column (stringified). */
  lastValue: string | null;
  /** The entity id tiebreaker. */
  id: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as CursorPayload;
    if (typeof raw.sort !== "string" || typeof raw.id !== "string") {
      throw new Error("malformed");
    }
    return raw;
  } catch {
    throw new ORPCError("validation_error", {
      status: ERROR_STATUS_MAP.validation_error,
      message: "Invalid cursor.",
      data: {
        details: [{ path: "cursor", message: "Malformed cursor value" }],
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Column resolution helpers
// ---------------------------------------------------------------------------

/**
 * Map a sort target to the actual SQL column reference and table alias.
 * Returns the column expression as a raw SQL fragment for ORDER BY / WHERE.
 */
function resolveSortColumn(
  sortField: string,
  definition: ModuleDefinition,
): { table: "entities" | "details"; column: string } | undefined {
  const target = definition.sorts[sortField];
  if (!target) return undefined;
  return { table: target.table, column: target.column };
}

// ---------------------------------------------------------------------------
// Feature check helper
// ---------------------------------------------------------------------------

function isFeatureEnabled(
  features: ModuleFeatures,
  feature: string,
): boolean {
  const val = features[feature as keyof ModuleFeatures];
  if (val === undefined || val === false) return false;
  return true; // true or object like { documents: true }
}

// ---------------------------------------------------------------------------
// Place field helpers (task 7.3, design D7)
// ---------------------------------------------------------------------------

/**
 * Validate that a `place_id` value (if any) references a live place, and that
 * the module's `placeRule` is satisfied. Uses the raw connection so it can
 * run inside a write transaction.
 */
export function validatePlaceId(
  conn: import("better-sqlite3").Database,
  placeId: string | null | undefined,
  placeRule: ModuleDefinition["placeRule"],
  forCreate: boolean,
): void {
  // Hidden modules show no place field; ignore any supplied value.
  if (placeRule === "hidden") return;

  if (placeId) {
    const row = conn
      .prepare(
        "SELECT id FROM entities WHERE id = ? AND type = 'place' AND deleted_at IS NULL",
      )
      .get(placeId) as { id: string } | undefined;
    if (!row) {
      throw new ORPCError("validation_error", {
        status: ERROR_STATUS_MAP.validation_error,
        message: "place_id must reference a place.",
        data: {
          details: [{ path: "placeId", message: "Reference must point to a place." }],
        },
      });
    }
  }

  if (forCreate && placeRule === "required" && !placeId) {
    throw new ORPCError("validation_error", {
      status: ERROR_STATUS_MAP.validation_error,
      message: "A place is required for this module.",
      data: {
        details: [{ path: "placeId", message: "placeId is required." }],
      },
    });
  }
}


// ---------------------------------------------------------------------------
// Generate procedures for one module
// ---------------------------------------------------------------------------

export function generateModuleProcedures(mod: AnyModuleRecord) {
  const { definition, server } = mod;
  const moduleType = definition.type;
  const detailsTable = server.detailsTable;

  // Build the list of valid sort keys from the definition
  const validSortKeys = Object.keys(definition.sorts);
  const defaultSort = validSortKeys.includes("updatedAt")
    ? "updatedAt"
    : validSortKeys[0] ?? "updatedAt";

  // Build filter enum values from definition
  const validFilterKeys = [...definition.filters];

  // ---------------------------------------------------------------------------
  // Input schemas
  // ---------------------------------------------------------------------------

  // For create/update we use the module's fields schema.
  // The fields schema has title (required), plus optional fields.
  const fieldsSchema = definition.fields;

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  const list = member
    .route({
      method: "GET",
      path: `/${moduleType}`,
    })
    .input(
      z.object({
        sort: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .handler(({ context, input }) => {
      const limit = input.limit ?? 50;
      const sortField = input.sort ?? defaultSort;
      const sortDir = input.sortDirection ?? "desc";

      // Validate sort field
      if (!validSortKeys.includes(sortField)) {
        throw new ORPCError("validation_error", {
          status: ERROR_STATUS_MAP.validation_error,
          message: `Invalid sort field: ${sortField}`,
          data: {
            details: [
              {
                path: "sort",
                message: `Must be one of: ${validSortKeys.join(", ")}`,
              },
            ],
          },
        });
      }

      // Validate filter keys. The shared `tag` filter (task 8.1) is a
      // cross-module pseudo-filter accepted in addition to module fields.
      if (input.filters) {
        for (const key of Object.keys(input.filters)) {
          if (key !== "tag" && key !== "tags" && !validFilterKeys.includes(key)) {
            throw new ORPCError("validation_error", {
              status: ERROR_STATUS_MAP.validation_error,
              message: `Invalid filter: ${key}`,
              data: {
                details: [
                  {
                    path: `filters.${key}`,
                    message: `Must be one of: ${[...validFilterKeys, "tag"].join(", ")}`,
                  },
                ],
              },
            });
          }
        }
      }

      // Resolve cursor
      let cursorPayload: CursorPayload | null = null;
      if (input.cursor) {
        cursorPayload = decodeCursor(input.cursor);
        if (cursorPayload.sort !== sortField) {
          throw new ORPCError("validation_error", {
            status: ERROR_STATUS_MAP.validation_error,
            message:
              "Cursor was created with a different sort; start a new query.",
            data: {
              details: [
                {
                  path: "cursor",
                  message: `Cursor sort "${cursorPayload.sort}" does not match requested sort "${sortField}"`,
                },
              ],
            },
          });
        }
      }

      const resolved = resolveSortColumn(sortField, definition);
      if (!resolved) {
        throw new ORPCError("validation_error", {
          status: ERROR_STATUS_MAP.validation_error,
          message: `Sort field "${sortField}" has no column mapping.`,
          data: {
            details: [{ path: "sort", message: "No column mapping" }],
          },
        });
      }

      // Build SQL query directly for keyset pagination
      const conn = (db as unknown as { $client: import("better-sqlite3").Database }).$client;

      // Determine sort column SQL expression
      const sortTable = resolved.table === "entities" ? "e" : "d";
      const sortCol = `${sortTable}.${resolved.column}`;

      // Base WHERE clauses
      const whereClauses: string[] = [
        "e.type = ?",
        "e.deleted_at IS NULL",
        "e.archived_at IS NULL",
      ];
      const params: unknown[] = [moduleType];

      // Apply filters
      if (input.filters) {
        for (const [key, value] of Object.entries(input.filters)) {
          // Shared tag filter (task 8.1): match entities carrying a tag by name.
          if (key === "tag" || key === "tags") {
            whereClauses.push(
              `EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entity_id = e.id AND t.name = ? COLLATE NOCASE)`,
            );
            params.push(String(value));
            continue;
          }
          // Map filter key to details column via sorts or direct name
          const sortTarget = definition.sorts[key];
          if (sortTarget && sortTarget.table === "details") {
            whereClauses.push(`d.${sortTarget.column} = ?`);
            params.push(value);
          } else if (sortTarget && sortTarget.table === "entities") {
            whereClauses.push(`e.${sortTarget.column} = ?`);
            params.push(value);
          } else {
            // Fall back to snake_case of the filter key on the details table
            const col = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
            whereClauses.push(`d.${col} = ?`);
            params.push(value);
          }
        }
      }

      // Scope filter (D7): apply the user's property scope, if any.
      const scope = buildScopeFilter(conn, context.user.id);
      if (scope.sql) {
        whereClauses.push(scope.sql);
        params.push(...scope.params);
      }

      // Cursor keyset condition
      if (cursorPayload) {
        const op = sortDir === "asc" ? ">" : "<";
        if (cursorPayload.lastValue === null) {
          // NULL sort values: tiebreak by id only
          whereClauses.push(`(${sortCol} IS NOT NULL OR (${sortCol} IS NULL AND e.id ${op} ?))`);
          params.push(cursorPayload.id);
        } else {
          whereClauses.push(
            `(${sortCol} ${op} ? OR (${sortCol} = ? AND e.id ${op} ?))`,
          );
          params.push(
            cursorPayload.lastValue,
            cursorPayload.lastValue,
            cursorPayload.id,
          );
        }
      }

      const whereSQL = whereClauses.join(" AND ");
      const orderDir = sortDir === "asc" ? "ASC" : "DESC";

      // NULLs: in ASC order put NULLs last; in DESC order put NULLs last
      const nullsOrder = sortDir === "asc" ? "DESC" : "ASC";

      const query = `
        SELECT e.*, d.*
        FROM entities e
        LEFT JOIN ${detailsTable[Symbol.for("drizzle:Name") as unknown as keyof typeof detailsTable] as string ?? snakeCase(moduleType) + "_details"} d
          ON d.entity_id = e.id
        WHERE ${whereSQL}
        ORDER BY ${sortCol} IS NULL ${nullsOrder}, ${sortCol} ${orderDir}, e.id ${orderDir}
        LIMIT ?
      `;
      params.push(limit + 1); // fetch one extra to detect next page

      const rows = conn.prepare(query).all(...params) as Array<
        Record<string, unknown>
      >;

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      // Build response
      const data = pageRows.map((row) => mapRowToEntity(row, definition));

      let nextCursor: string | null = null;
      if (hasMore && pageRows.length > 0) {
        const lastRow = pageRows[pageRows.length - 1]!;
        const lastSortValue = lastRow[resolved.column];
        nextCursor = encodeCursor({
          sort: sortField,
          lastValue: lastSortValue === null || lastSortValue === undefined
            ? null
            : String(lastSortValue),
          id: String(lastRow.id),
        });
      }

      return { data, nextCursor };
    });

  // ---------------------------------------------------------------------------
  // get
  // ---------------------------------------------------------------------------

  const get = member
    .route({
      method: "GET",
      path: `/${moduleType}/{id}`,
    })
    .input(z.object({ id: z.string() }))
    .handler(({ input }) => {
      const conn = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
      const tableName = getTableName(detailsTable);

      const row = conn
        .prepare(
          `SELECT e.*, d.*
           FROM entities e
           LEFT JOIN ${tableName} d ON d.entity_id = e.id
           WHERE e.id = ? AND e.type = ? AND e.deleted_at IS NULL`,
        )
        .get(input.id, moduleType) as Record<string, unknown> | undefined;

      if (!row) {
        throw new ORPCError("not_found", {
          status: ERROR_STATUS_MAP.not_found,
          message: "Entity not found.",
        });
      }

      return mapRowToEntity(row, definition);
    });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  const create = member
    .route({
      method: "POST",
      path: `/${moduleType}`,
    })
    .input(fieldsSchema.extend({ placeId: z.string().nullish() }))
    .handler(async ({ context, input }) => {
      const id = randomUUID();
      const viaLabel =
        typeof context.via === "object" ? context.via.name : null;
      const placeId = (input as Record<string, unknown>).placeId as
        | string
        | null
        | undefined;

      const result = await writeWithDb(
        db,
        context as WriteContext,
        (tx, changes) => {
          const conn = (
            tx as unknown as { $client: import("better-sqlite3").Database }
          ).$client ?? (
            db as unknown as { $client: import("better-sqlite3").Database }
          ).$client;

          // Place rule (D7): validate place_id references a place.
          validatePlaceId(conn, placeId, definition.placeRule, true);

          // Extract title from fields
          const title = (input as Record<string, unknown>).title as string;

          // Insert entity row
          tx.insert(entities)
            .values({
              id,
              type: moduleType,
              title,
              placeId: placeId ?? null,
              version: 1,
              createdBy: context.user.id,
              createdVia: viaLabel,
              updatedBy: context.user.id,
              updatedVia: viaLabel,
              createdAt: new Date(context.now),
              updatedAt: new Date(context.now),
            })
            .run();

          // Build details row from input fields
          const detailsValues: Record<string, unknown> = {
            entityId: id,
          };
          const fieldKeys = Object.keys(definition.fields.shape);
          for (const key of fieldKeys) {
            if (key === "title") continue; // title is on entities
            const value = (input as Record<string, unknown>)[key];
            detailsValues[key] = value ?? null;
          }

          // Insert details row using raw SQL for flexibility
          insertDetails(conn, detailsValues, definition);

          changes.touch(id);
          changes.addActivity({
            entityId: id,
            action: "create",
            diff: { fields: buildCreateDiff(input as Record<string, unknown>, definition) },
          });

          return { id };
        },
      );

      // Fetch and return the full entity
      const conn = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
      const tableName = getTableName(detailsTable);
      const row = conn
        .prepare(
          `SELECT e.*, d.*
           FROM entities e
           LEFT JOIN ${tableName} d ON d.entity_id = e.id
           WHERE e.id = ?`,
        )
        .get(result.id) as Record<string, unknown>;

      return mapRowToEntity(row, definition);
    });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  const update = member
    .route({
      method: "PATCH",
      path: `/${moduleType}/{id}`,
    })
    .input(
      z.object({
        id: z.string(),
        expectedVersion: z.number().int().optional(),
        data: fieldsSchema.partial().extend({ placeId: z.string().nullish() }),
      }),
    )
    .handler(async ({ context, input }) => {
      const viaLabel =
        typeof context.via === "object" ? context.via.name : null;

      await writeWithDb(
        db,
        context as WriteContext,
        (tx, changes) => {
          const conn = (
            db as unknown as { $client: import("better-sqlite3").Database }
          ).$client;

          // Load current entity
          const current = conn
            .prepare(
              "SELECT * FROM entities WHERE id = ? AND type = ? AND deleted_at IS NULL",
            )
            .get(input.id, moduleType) as Record<string, unknown> | undefined;

          if (!current) {
            throw new ORPCError("not_found", {
              status: ERROR_STATUS_MAP.not_found,
              message: "Entity not found.",
            });
          }

          // Version check (D13)
          if (
            input.expectedVersion !== undefined &&
            input.expectedVersion !== (current.version as number)
          ) {
            throw new ORPCError("conflict", {
              status: ERROR_STATUS_MAP.conflict,
              message: "Entity has been modified. Refresh and retry.",
              data: { currentVersion: current.version },
            });
          }

          const updateData = input.data as Record<string, unknown>;

          // Place field (D7): validate the new place reference before writing.
          const newPlaceId =
            updateData.placeId !== undefined
              ? (updateData.placeId as string | null)
              : (current.place_id as string | null);
          validatePlaceId(conn, newPlaceId, definition.placeRule, false);

          // Load current details
          const tableName = getTableName(detailsTable);
          const currentDetails = conn
            .prepare(`SELECT * FROM ${tableName} WHERE entity_id = ?`)
            .get(input.id) as Record<string, unknown> | undefined;

          // Track diffs
          const fieldDiffs: Record<string, [unknown, unknown]> = {};

          // Update title on entities if provided
          if (updateData.title !== undefined) {
            const oldTitle = current.title;
            if (oldTitle !== updateData.title) {
              fieldDiffs.title = [oldTitle, updateData.title];
            }
          }

          // Update details fields
          const detailUpdates: Record<string, unknown> = {};
          const fieldKeys = Object.keys(definition.fields.shape);
          for (const key of fieldKeys) {
            if (key === "title") continue;
            if (updateData[key] !== undefined) {
              const snakeKey = key.replace(
                /[A-Z]/g,
                (c) => `_${c.toLowerCase()}`,
              );
              const oldVal = currentDetails
                ? currentDetails[snakeKey] ?? currentDetails[key]
                : null;
              if (oldVal !== updateData[key]) {
                fieldDiffs[key] = [oldVal ?? null, updateData[key]];
                detailUpdates[key] = updateData[key];
              }
            }
          }

          // Bump version and update entities row
          const newVersion = (current.version as number) + 1;
          const entityUpdates: string[] = [
            "version = ?",
            "updated_by = ?",
            "updated_via = ?",
            "updated_at = ?",
          ];
          const entityParams: unknown[] = [
            newVersion,
            context.user.id,
            viaLabel,
            context.now,
          ];

          if (updateData.title !== undefined) {
            entityUpdates.push("title = ?");
            entityParams.push(updateData.title);
          }

          // Place change (D7): set place_id and record the field diff.
          if (updateData.placeId !== undefined) {
            const oldPlaceId = (current.place_id as string | null) ?? null;
            const newPlaceIdRaw = updateData.placeId;
            const newPlaceId = newPlaceIdRaw == null ? null : (newPlaceIdRaw as string);
            if (oldPlaceId !== newPlaceId) {
              fieldDiffs.placeId = [oldPlaceId, newPlaceId];
              entityUpdates.push("place_id = ?");
              entityParams.push(newPlaceId);
            }
          }

          entityParams.push(input.id);
          conn
            .prepare(
              `UPDATE entities SET ${entityUpdates.join(", ")} WHERE id = ?`,
            )
            .run(...entityParams);

          // Update details
          if (Object.keys(detailUpdates).length > 0) {
            const setClauses: string[] = [];
            const setParams: unknown[] = [];
            for (const [key, value] of Object.entries(detailUpdates)) {
              const snakeKey = key.replace(
                /[A-Z]/g,
                (c) => `_${c.toLowerCase()}`,
              );
              setClauses.push(`${snakeKey} = ?`);
              setParams.push(value ?? null);
            }
            setParams.push(input.id);
            conn
              .prepare(
                `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE entity_id = ?`,
              )
              .run(...setParams);
          }

          if (Object.keys(fieldDiffs).length > 0) {
            // Record per-field diffs (D12): `{ fields: { <field>: [before, after] } }`
            // so that undo can restore individual fields and detect conflicts.
            for (const [field, [before, after]] of Object.entries(fieldDiffs)) {
              changes.recordFieldDiff(input.id, field, before, after);
            }
          }
          changes.touch(input.id);
        },
      );

      // Return updated entity
      const conn = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
      const tableName = getTableName(detailsTable);
      const row = conn
        .prepare(
          `SELECT e.*, d.*
           FROM entities e
           LEFT JOIN ${tableName} d ON d.entity_id = e.id
           WHERE e.id = ?`,
        )
        .get(input.id) as Record<string, unknown>;

      return mapRowToEntity(row, definition);
    });

  // ---------------------------------------------------------------------------
  // archive
  // ---------------------------------------------------------------------------

  const archive = member
    .route({
      method: "POST",
      path: `/${moduleType}/{id}/archive`,
    })
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await writeWithDb(
        db,
        context as WriteContext,
        (_tx, changes) => {
          const conn = (
            db as unknown as { $client: import("better-sqlite3").Database }
          ).$client;

          const current = conn
            .prepare(
              "SELECT * FROM entities WHERE id = ? AND type = ? AND deleted_at IS NULL",
            )
            .get(input.id, moduleType) as Record<string, unknown> | undefined;

          if (!current) {
            throw new ORPCError("not_found", {
              status: ERROR_STATUS_MAP.not_found,
              message: "Entity not found.",
            });
          }

          conn
            .prepare(
              "UPDATE entities SET archived_at = ?, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?",
            )
            .run(context.now, context.user.id, context.now, input.id);

          changes.touch(input.id);
          changes.addActivity({
            entityId: input.id,
            action: "archive",
            diff: {},
          });
        },
      );

      return { ok: true };
    });

  // ---------------------------------------------------------------------------
  // unarchive
  // ---------------------------------------------------------------------------

  const unarchive = member
    .route({
      method: "POST",
      path: `/${moduleType}/{id}/unarchive`,
    })
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await writeWithDb(
        db,
        context as WriteContext,
        (_tx, changes) => {
          const conn = (
            db as unknown as { $client: import("better-sqlite3").Database }
          ).$client;

          const current = conn
            .prepare(
              "SELECT * FROM entities WHERE id = ? AND type = ? AND deleted_at IS NULL",
            )
            .get(input.id, moduleType) as Record<string, unknown> | undefined;

          if (!current) {
            throw new ORPCError("not_found", {
              status: ERROR_STATUS_MAP.not_found,
              message: "Entity not found.",
            });
          }

          conn
            .prepare(
              "UPDATE entities SET archived_at = NULL, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?",
            )
            .run(context.user.id, context.now, input.id);

          changes.touch(input.id);
          changes.addActivity({
            entityId: input.id,
            action: "unarchive",
            diff: {},
          });
        },
      );

      return { ok: true };
    });

  // ---------------------------------------------------------------------------
  // delete (soft — move to trash)
  // ---------------------------------------------------------------------------

  const del = member
    .route({
      method: "POST",
      path: `/${moduleType}/{id}/delete`,
    })
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const trashBatchId = randomUUID();

      await writeWithDb(
        db,
        context as WriteContext,
        (_tx, changes) => {
          const conn = (
            db as unknown as { $client: import("better-sqlite3").Database }
          ).$client;

          const current = conn
            .prepare(
              "SELECT * FROM entities WHERE id = ? AND type = ?",
            )
            .get(input.id, moduleType) as Record<string, unknown> | undefined;

          if (!current) {
            throw new ORPCError("not_found", {
              status: ERROR_STATUS_MAP.not_found,
              message: "Entity not found.",
            });
          }

          conn
            .prepare(
              `UPDATE entities
               SET deleted_at = ?, trash_batch_id = ?,
                   updated_by = ?, updated_at = ?, version = version + 1
               WHERE id = ?`,
            )
            .run(
              context.now,
              trashBatchId,
              context.user.id,
              context.now,
              input.id,
            );

          changes.touch(input.id);
          changes.addActivity({
            entityId: input.id,
            action: "delete",
            diff: {},
          });
        },
      );

      return { ok: true };
    });

  // ---------------------------------------------------------------------------
  // restore
  // ---------------------------------------------------------------------------

  const restore = member
    .route({
      method: "POST",
      path: `/${moduleType}/{id}/restore`,
    })
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await writeWithDb(
        db,
        context as WriteContext,
        (_tx, changes) => {
          const conn = (
            db as unknown as { $client: import("better-sqlite3").Database }
          ).$client;

          const current = conn
            .prepare(
              "SELECT * FROM entities WHERE id = ? AND type = ?",
            )
            .get(input.id, moduleType) as Record<string, unknown> | undefined;

          if (!current || current.deleted_at === null) {
            throw new ORPCError("not_found", {
              status: ERROR_STATUS_MAP.not_found,
              message: "Entity not found in trash.",
            });
          }

          conn
            .prepare(
              `UPDATE entities
               SET deleted_at = NULL, trash_batch_id = NULL,
                   updated_by = ?, updated_at = ?, version = version + 1
               WHERE id = ?`,
            )
            .run(context.user.id, context.now, input.id);

          changes.touch(input.id);
          changes.addActivity({
            entityId: input.id,
            action: "restore",
            diff: {},
          });
        },
      );

      return { ok: true };
    });

  return {
    list,
    get,
    create,
    update,
    archive,
    unarchive,
    delete: del,
    restore,
  };
}

// ---------------------------------------------------------------------------
// Helper: get the SQL table name from a Drizzle table object
// ---------------------------------------------------------------------------

function getTableName(table: unknown): string {
  // Drizzle stores the table name under Symbol('drizzle:Name')
  // or via the Table.name property
  const t = table as Record<string | symbol, unknown>;
  // Try the symbol first
  for (const sym of Object.getOwnPropertySymbols(t)) {
    if (sym.toString().includes("Name")) {
      return t[sym] as string;
    }
  }
  // Fallback: try _.name
  if (t._ && typeof t._ === "object") {
    const meta = t._ as Record<string, unknown>;
    if (typeof meta.name === "string") return meta.name;
  }
  throw new Error("Cannot resolve table name from Drizzle table object");
}

function snakeCase(str: string): string {
  return str.replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// Helper: insert details row via raw SQL
// ---------------------------------------------------------------------------

function insertDetails(
  conn: import("better-sqlite3").Database,
  values: Record<string, unknown>,
  definition: ModuleDefinition,
): void {
  const tableName = snakeCase(definition.type) + "_details";
  const columns: string[] = ["entity_id"];
  const placeholders: string[] = ["?"];
  const params: unknown[] = [values.entityId];

  const fieldKeys = Object.keys(definition.fields.shape);
  for (const key of fieldKeys) {
    if (key === "title") continue;
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    columns.push(snakeKey);
    placeholders.push("?");
    params.push(values[key] ?? null);
  }

  conn
    .prepare(
      `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
    )
    .run(...params);
}

// ---------------------------------------------------------------------------
// Helper: build create diff for activity
// ---------------------------------------------------------------------------

function buildCreateDiff(
  input: Record<string, unknown>,
  definition: ModuleDefinition,
): Record<string, [null, unknown]> {
  const diff: Record<string, [null, unknown]> = {};
  for (const key of Object.keys(definition.fields.shape)) {
    if (input[key] !== undefined) {
      diff[key] = [null, input[key]];
    }
  }
  return diff;
}

// ---------------------------------------------------------------------------
// Helper: map raw SQL row to entity response object
// ---------------------------------------------------------------------------

function mapRowToEntity(
  row: Record<string, unknown>,
  definition: ModuleDefinition,
): Record<string, unknown> {
  const fieldKeys = Object.keys(definition.fields.shape);

  const entity: Record<string, unknown> = {
    id: row.id,
    type: row.type,
    title: row.title,
    placeId: row.place_id ?? null,
    version: row.version,
    createdBy: row.created_by,
    createdVia: row.created_via ?? null,
    updatedBy: row.updated_by,
    updatedVia: row.updated_via ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };

  // Add module fields from details
  for (const key of fieldKeys) {
    if (key === "title") {
      // title is already on the entity
      continue;
    }
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    entity[key] = row[snakeKey] ?? row[key] ?? null;
  }

  return entity;
}

// ---------------------------------------------------------------------------
// Generate procedures for ALL registered modules
// ---------------------------------------------------------------------------

/**
 * Generate the full set of module procedures from the registry.
 * Returns a flat record keyed as `<module>.<operation>` for router merging.
 */
export function generateAllModuleProcedures(
  registry: Record<string, AnyModuleRecord>,
): Record<string, unknown> {
  const procedures: Record<string, unknown> = {};

  for (const [type, mod] of Object.entries(registry)) {
    // Places are managed through custom procedures (task 7.1): they need
    // parent/path handling that the generic generator cannot provide, so
    // skip generic CRUD generation for the 'place' module.
    if (type === "place") continue;
    const procs = generateModuleProcedures(mod);
    // Use a naming convention: notesPage_list, notesPage_get, etc.
    const prefix = type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    procedures[`${prefix}List`] = procs.list;
    procedures[`${prefix}Get`] = procs.get;
    procedures[`${prefix}Create`] = procs.create;
    procedures[`${prefix}Update`] = procs.update;
    procedures[`${prefix}Archive`] = procs.archive;
    procedures[`${prefix}Unarchive`] = procs.unarchive;
    procedures[`${prefix}Delete`] = procs.delete;
    procedures[`${prefix}Restore`] = procs.restore;
  }

  return procedures;
}

// ---------------------------------------------------------------------------
// Feature-gated entity access middleware builder
// ---------------------------------------------------------------------------

/**
 * Check that a module enables the specified feature. Returns forbidden (403)
 * if not. This wraps the `entityAccess(feature)` contract from D3.
 *
 * Meant for use by shared feature procedures (attachments, comments, etc.)
 * that load an entity and need to ensure the module enables that feature.
 */
export function checkFeatureEnabled(
  registry: Record<string, AnyModuleRecord>,
  entityType: string,
  feature: string,
): void {
  const mod = registry[entityType];
  if (!mod) {
    throw new ORPCError("not_found", {
      status: ERROR_STATUS_MAP.not_found,
      message: "Unknown module type.",
    });
  }
  if (!isFeatureEnabled(mod.definition.features, feature)) {
    throw new ORPCError("forbidden", {
      status: ERROR_STATUS_MAP.forbidden,
      message: `Feature "${feature}" is not enabled for module "${entityType}".`,
    });
  }
}
