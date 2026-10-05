/**
 * Write pipeline (design D4, task 3.3).
 *
 * `write(ctx, fn, opts?)` is the only way to change data. It wraps a
 * synchronous `BEGIN IMMEDIATE` transaction with automatic activity logging,
 * search reindexing, attention dedup, and idempotency support.
 *
 * The transaction callback `fn(tx, changes)` MUST be synchronous — its return
 * type rejects `Promise` at compile time so that an `await` cannot slip in.
 */

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema";
import { db } from "../db";
import { ORPCError } from "@orpc/server";
import { ERROR_STATUS_MAP } from "./orpc";
import { reindex } from "../db/search";

// ---------------------------------------------------------------------------
// Type-level sync guard: rejects Promise returns
// ---------------------------------------------------------------------------

/**
 * Resolves to `never` when `T` is a PromiseLike, preventing async callbacks
 * from type-checking when used as a return type constraint.
 */
type NoPromise<T> = T extends PromiseLike<unknown> ? never : T;

// ---------------------------------------------------------------------------
// Context required by write()
// ---------------------------------------------------------------------------

/** The subset of AppContext that write() needs. User must be non-null. */
export interface WriteContext {
  user: { id: string; role?: string | null };
  via: "web" | { apiKeyId: string; name: string | null };
  now: number;
  requestId: string;
  /** REST Idempotency-Key (D13), threaded by the REST adapter. */
  idempotencyKey?: string;
  /** Hash of the request body, threaded by the REST adapter. */
  requestHash?: string;
}

// ---------------------------------------------------------------------------
// Change set: records what fn() changed
// ---------------------------------------------------------------------------

export interface AttentionItem {
  userId: string;
  reason: string;
  entityId: string;
  sourceType: string;
  sourceId: string;
  occurrenceKey: string;
}

export interface ActivityMeta {
  entityId: string;
  action: string;
  diff: Record<string, unknown>;
}

/**
 * A mutable bag that `fn(tx, changes)` records into. The write pipeline
 * flushes it inside the same transaction before commit.
 */
export class ChangeSet {
  /** Per-entity field diffs: `{ field: [before, after] }`. */
  readonly entityFieldDiffs = new Map<
    string,
    Record<string, [unknown, unknown]>
  >();

  /** Named set deltas: `{ added: string[], removed: string[] }`. */
  readonly setDeltas = new Map<
    string,
    { added: string[]; removed: string[] }
  >();

  /** Per-entity notes revisions. */
  readonly notesRevisions = new Map<
    string,
    { prev: unknown; next: unknown }
  >();

  /** Attention items to insert. */
  readonly attention: AttentionItem[] = [];

  /** Ids of entities whose search index row should be recomputed. */
  readonly touched = new Set<string>();

  /** Explicit activity entries to create (beyond auto-generated field-diff ones). */
  readonly activityEntries: ActivityMeta[] = [];

  // ---- helpers procedures call ----

  recordFieldDiff(
    entityId: string,
    field: string,
    before: unknown,
    after: unknown,
  ): void {
    let rec = this.entityFieldDiffs.get(entityId);
    if (!rec) {
      rec = {};
      this.entityFieldDiffs.set(entityId, rec);
    }
    rec[field] = [before, after];
    this.touched.add(entityId);
  }

  addSetDelta(
    key: string,
    added: string[],
    removed: string[],
  ): void {
    const existing = this.setDeltas.get(key);
    if (existing) {
      existing.added.push(...added);
      existing.removed.push(...removed);
    } else {
      this.setDeltas.set(key, { added: [...added], removed: [...removed] });
    }
  }

  recordNotesRevision(
    entityId: string,
    prev: unknown,
    next: unknown,
  ): void {
    this.notesRevisions.set(entityId, { prev, next });
    this.touched.add(entityId);
  }

  addAttention(item: AttentionItem): void {
    this.attention.push(item);
  }

  touch(entityId: string): void {
    this.touched.add(entityId);
  }

  addActivity(entry: ActivityMeta): void {
    this.activityEntries.push(entry);
  }
}

// ---------------------------------------------------------------------------
// Transaction type alias (Drizzle better-sqlite3 sync)
// ---------------------------------------------------------------------------

/**
 * The Drizzle transaction handle passed to `fn`. Extracted from the
 * `db.transaction()` callback parameter so it stays in sync with the
 * actual Drizzle version.
 */
export type WriteTx = Parameters<
  Parameters<BetterSQLite3Database<typeof schema>["transaction"]>[0]
>[0];

// ---------------------------------------------------------------------------
// Write options
// ---------------------------------------------------------------------------

export interface WriteOptions<P = void> {
  /** Async pre-transaction I/O; its return is forwarded to fn and afterCommit. */
  prepare?: (ctx: WriteContext) => Promise<P>;
  /** Runs only after a successful commit. Failures are logged. */
  afterCommit?: (
    ctx: WriteContext,
    result: unknown,
    prepared: P,
  ) => Promise<void>;
  /** REST Idempotency-Key (D13). Only for API-key callers. */
  idempotencyKey?: string;
  /** Hash of the request body. Required when idempotencyKey is set. */
  requestHash?: string;
}

// ---------------------------------------------------------------------------
// Coalescing window (D12)
// ---------------------------------------------------------------------------

const COALESCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface ActivityRow {
  id: string;
  entity_id: string;
  actor_id: string;
  api_key_id: string | null;
  via_label: string | null;
  action: string;
  diff: string;
  created_at: number;
  updated_at: number;
}

/**
 * Find a coalesceable activity row: the most recent `update` by the same
 * actor+channel on the same entity within the coalescing window, with no
 * intervening activity by another actor or any undo.
 */
function findCoalesceCandidate(
  conn: Database.Database,
  entityId: string,
  actorId: string,
  apiKeyId: string | null,
  nowMs: number,
): ActivityRow | undefined {
  const cutoff = nowMs - COALESCE_WINDOW_MS;

  // Find the most recent update by same actor+channel
  const candidate = conn
    .prepare(
      `SELECT * FROM activity
       WHERE entity_id = ? AND actor_id = ? AND api_key_id IS ?
         AND action = 'update' AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(entityId, actorId, apiKeyId, cutoff) as ActivityRow | undefined;

  if (!candidate) return undefined;

  // Check for intervening activity by another actor or any undo
  const intervening = conn
    .prepare(
      `SELECT COUNT(*) as cnt FROM activity
       WHERE entity_id = ? AND created_at > ?
         AND (actor_id != ? OR undoes_id IS NOT NULL)`,
    )
    .get(entityId, candidate.created_at, actorId) as { cnt: number };

  if (intervening.cnt > 0) return undefined;

  return candidate;
}

/**
 * Merge a new diff into an existing diff, keeping the first `before` and
 * the last `after` for each field.
 */
function mergeDiffs(
  existingDiffJson: string,
  newDiff: Record<string, unknown>,
): string {
  const existing = JSON.parse(existingDiffJson) as Record<string, unknown>;

  // Merge field diffs (arrays of [before, after])
  if (newDiff.fields && typeof newDiff.fields === "object") {
    const existingFields = (existing.fields ?? {}) as Record<
      string,
      [unknown, unknown]
    >;
    const newFields = newDiff.fields as Record<string, [unknown, unknown]>;
    for (const [field, [, after]] of Object.entries(newFields)) {
      if (field in existingFields) {
        // Keep first before, update after
        existingFields[field] = [existingFields[field][0], after];
      } else {
        existingFields[field] = newFields[field];
      }
    }
    existing.fields = existingFields;
  }

  // Merge set deltas
  if (newDiff.sets && typeof newDiff.sets === "object") {
    const existingSets = (existing.sets ?? {}) as Record<
      string,
      { added: string[]; removed: string[] }
    >;
    const newSets = newDiff.sets as Record<
      string,
      { added: string[]; removed: string[] }
    >;
    for (const [key, delta] of Object.entries(newSets)) {
      if (key in existingSets) {
        existingSets[key].added.push(...delta.added);
        existingSets[key].removed.push(...delta.removed);
      } else {
        existingSets[key] = delta;
      }
    }
    existing.sets = existingSets;
  }

  return JSON.stringify(existing);
}

/**
 * Flush activity rows for this write, applying coalescing (D12).
 */
function flushActivity(
  conn: Database.Database,
  ctx: WriteContext,
  changes: ChangeSet,
): void {
  const actorId = ctx.user.id;
  const apiKeyId =
    typeof ctx.via === "object" ? ctx.via.apiKeyId : null;
  const viaLabel =
    typeof ctx.via === "object" ? ctx.via.name : null;

  // Collect activity entries from field diffs
  const autoEntries: ActivityMeta[] = [];
  for (const [entityId, fields] of changes.entityFieldDiffs) {
    autoEntries.push({
      entityId,
      action: "update",
      diff: { fields },
    });
  }

  // Collect set delta entries
  if (changes.setDeltas.size > 0) {
    const sets: Record<string, { added: string[]; removed: string[] }> = {};
    for (const [key, delta] of changes.setDeltas) {
      sets[key] = delta;
    }
    // Set deltas don't have a single entity; they're recorded in explicit
    // activity entries by the caller. Skip auto-generation for bare set deltas.
  }

  // Combine auto-generated and explicit entries
  const allEntries = [...autoEntries, ...changes.activityEntries];

  for (const entry of allEntries) {
    if (entry.action === "update") {
      // Try to coalesce
      const candidate = findCoalesceCandidate(
        conn,
        entry.entityId,
        actorId,
        apiKeyId,
        ctx.now,
      );

      if (candidate) {
        // Merge diffs and update the existing row
        const merged = mergeDiffs(candidate.diff, entry.diff);
        conn
          .prepare(
            `UPDATE activity SET diff = ?, updated_at = ? WHERE id = ?`,
          )
          .run(merged, ctx.now, candidate.id);
        continue;
      }
    }

    // Insert a new activity row
    const id = randomUUID();
    conn
      .prepare(
        `INSERT INTO activity
         (id, entity_id, actor_id, api_key_id, via_label, action, diff, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.entityId,
        actorId,
        apiKeyId,
        viaLabel,
        entry.action,
        JSON.stringify(entry.diff),
        ctx.now,
        ctx.now,
      );
  }
}

/**
 * Flush search reindex for all touched entities.
 */
function flushSearch(
  conn: Database.Database,
  touched: Set<string>,
): void {
  for (const entityId of touched) {
    reindex(conn, entityId);
  }
}

/**
 * Flush attention rows with `ON CONFLICT DO NOTHING` on (user_id, occurrence_key).
 */
function flushAttention(
  conn: Database.Database,
  items: AttentionItem[],
): void {
  if (items.length === 0) return;

  const stmt = conn.prepare(
    `INSERT INTO attention
     (id, user_id, reason, entity_id, source_type, source_id, occurrence_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, occurrence_key) DO NOTHING`,
  );

  for (const item of items) {
    stmt.run(
      randomUUID(),
      item.userId,
      item.reason,
      item.entityId,
      item.sourceType,
      item.sourceId,
      item.occurrenceKey,
    );
  }
}

// ---------------------------------------------------------------------------
// write()
// ---------------------------------------------------------------------------

/**
 * The only way to change data (design D4).
 *
 * Opens a synchronous `BEGIN IMMEDIATE` transaction, calls `fn(tx, changes)`,
 * flushes the change set (activity, search, attention, idempotency), and
 * commits. Rolls back on any thrown error.
 *
 * The return type of `fn` is constrained so that returning a Promise is a
 * **type error**, preventing accidental `await` inside the transaction.
 *
 * @example
 * ```ts
 * const result = await write(ctx, (tx, changes) => {
 *   tx.insert(entities).values({ ... }).run();
 *   changes.touch(id);
 *   return { id };
 * });
 * ```
 */
export async function write<R, P = void>(
  ctx: WriteContext,
  fn: (tx: WriteTx, changes: ChangeSet) => NoPromise<R>,
  opts?: WriteOptions<P>,
): Promise<R> {
  // 1. prepare (async, before transaction)
  const prepared = opts?.prepare
    ? await opts.prepare(ctx)
    : (undefined as P);

  // Resolve the raw better-sqlite3 connection from the Drizzle client.
  // Tests inject an in-memory client via `writeWithDb`; in production we fall
  // back to the imported singleton `db` (the household's one connection, D19).
  const dbClient = (ctx as WriteContextWithDb)._db ?? db;

  const conn = (dbClient as unknown as { $client: Database.Database }).$client;

  // 2. Idempotency check (before running fn)
  const apiKeyId =
    typeof ctx.via === "object" ? ctx.via.apiKeyId : null;

  // REST idempotency is threaded through ctx (D3 adapter). Fall back to the
  // explicit opts when the caller passes them directly (tests / internal).
  const idempotencyKey = opts?.idempotencyKey ?? ctx.idempotencyKey;
  const requestHash = opts?.requestHash ?? ctx.requestHash;

  // 3. Synchronous transaction
  const result: R = dbClient.transaction((tx) => {
    // Idempotency: check for replayed key
    if (idempotencyKey && apiKeyId) {
      const existing = conn
        .prepare(
          `SELECT request_hash, response FROM idempotency_keys
           WHERE api_key_id = ? AND key = ?`,
        )
        .get(apiKeyId, idempotencyKey) as
        | { request_hash: string; response: string }
        | undefined;

      if (existing) {
        if (existing.request_hash === requestHash) {
          // Same key + same hash → return stored response
          return JSON.parse(existing.response) as NoPromise<R>;
        }
        // Same key + different hash → conflict
        throw new ORPCError("conflict", {
          status: ERROR_STATUS_MAP.conflict,
          message:
            "Idempotency key already used with a different request.",
        });
      }
    }

    const changes = new ChangeSet();

    // Run the user's synchronous callback
    const fnResult = fn(tx, changes);

    // Flush change set before commit
    flushActivity(conn, ctx, changes);
    flushSearch(conn, changes.touched);
    flushAttention(conn, changes.attention);

    // Store idempotency record
    if (idempotencyKey && apiKeyId) {
      conn
        .prepare(
          `INSERT INTO idempotency_keys
           (api_key_id, key, request_hash, response, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          apiKeyId,
          idempotencyKey,
          requestHash ?? "",
          JSON.stringify(fnResult),
          ctx.now,
        );
    }

    return fnResult as NoPromise<R>;
  }, { behavior: "immediate" }) as R;

  // 4. afterCommit (async, only on success)
  if (opts?.afterCommit) {
    try {
      await opts.afterCommit(ctx, result, prepared);
    } catch (err) {
      console.error(
        `[${ctx.requestId}] afterCommit error (non-fatal):`,
        err,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// writeWithDb: test-friendly variant that accepts a db handle
// ---------------------------------------------------------------------------

/** Extended context that carries a Drizzle db handle (for tests and adapters). */
export interface WriteContextWithDb extends WriteContext {
  _db: BetterSQLite3Database<typeof schema>;
}

/**
 * Convenience wrapper that binds a specific Drizzle `db` into the context
 * so `write()` can find the connection. Used by tests and by the production
 * adapter (task 3.4 will wire the singleton `db`).
 */
export function writeWithDb<R, P = void>(
  db: BetterSQLite3Database<typeof schema>,
  ctx: WriteContext,
  fn: (tx: WriteTx, changes: ChangeSet) => NoPromise<R>,
  opts?: WriteOptions<P>,
): Promise<R> {
  return write({ ...ctx, _db: db } as WriteContext, fn, opts);
}
