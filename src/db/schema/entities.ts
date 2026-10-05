import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/** Milliseconds-since-epoch timestamp (consistent with the auth schema). */
const tsMs = { mode: "timestamp_ms" } as const;
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// ---------------------------------------------------------------------------
// entities — core record (design D1)
// ---------------------------------------------------------------------------
export const entities = sqliteTable(
  "entities",
  {
    /** Lowercase UUID, set by the caller (`crypto.randomUUID()`). */
    id: text("id").primaryKey(),
    /** Module type key, e.g. "notes-page" or "place". */
    type: text("type").notNull(),
    title: text("title").notNull(),
    /**
     * Parent place. Nullable; the owning entity may not be placed.
     * ON DELETE SET NULL so purging a place unplaces its children (D7).
     */
    placeId: text("place_id").references(
      (): AnySQLiteColumn => entities.id,
      { onDelete: "set null" },
    ),
    /** Incremented on every write; used for optimistic concurrency (D13). */
    version: integer("version").notNull().default(1),
    /** User who created this entity. RESTRICT because users are disabled, not deleted (D6). */
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Snapshot of the API key name at creation time, or null for web. */
    createdVia: text("created_via"),
    /** User who last updated this entity. */
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Snapshot of the API key name at last-update time, or null for web. */
    updatedVia: text("updated_via"),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
    updatedAt: integer("updated_at", tsMs).notNull().default(nowMs),
    /** Set when archived; null otherwise. */
    archivedAt: integer("archived_at", tsMs),
    /** Set when soft-deleted (trashed); null otherwise. */
    deletedAt: integer("deleted_at", tsMs),
    /** Shared across all entities trashed in one batch (e.g. place + subtree). */
    trashBatchId: text("trash_batch_id"),
  },
  (table) => [
    /** Covers type-filtered list queries with archival/deletion visibility and cursor. */
    index("entities_type_del_arch_upd_id_idx").on(
      table.type,
      table.deletedAt,
      table.archivedAt,
      table.updatedAt,
      table.id,
    ),
    index("entities_place_id_idx").on(table.placeId),
    index("entities_deleted_at_idx").on(table.deletedAt),
    index("entities_trash_batch_id_idx").on(table.trashBatchId),
  ],
);

// ---------------------------------------------------------------------------
// activity — write history (design D8, D12)
// ---------------------------------------------------------------------------
export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    /** Set when the write was made via an API key. */
    apiKeyId: text("api_key_id"),
    /** Snapshot of the API key name at write time. */
    viaLabel: text("via_label"),
    action: text("action").notNull(),
    /** Field diffs `{field:[before,after]}` or set deltas `{added,removed}`. */
    diff: text("diff", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
    updatedAt: integer("updated_at", tsMs).notNull().default(nowMs),
    /** The activity entry this entry undoes (D12). */
    undoesId: text("undoes_id"),
    /** The activity entry that undid this entry. */
    undoneById: text("undone_by_id"),
  },
  (table) => [
    index("activity_created_at_idx").on(table.createdAt),
    index("activity_entity_id_created_at_idx").on(
      table.entityId,
      table.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// attention — inbox / notification items (design D8)
// ---------------------------------------------------------------------------
export const attention = sqliteTable(
  "attention",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    /** "mention" | "assigned" | "reminder" */
    reason: text("reason").notNull(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    /**
     * Deduplication key, e.g. `mention:<type>:<srcId>:<userId>:<writeId>`.
     * ON CONFLICT DO NOTHING on this key makes writes idempotent (D4).
     */
    occurrenceKey: text("occurrence_key").notNull(),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
    readAt: integer("read_at", tsMs),
    dismissedAt: integer("dismissed_at", tsMs),
    resolvedAt: integer("resolved_at", tsMs),
  },
  (table) => [
    uniqueIndex("attention_user_occurrence_key_unique").on(
      table.userId,
      table.occurrenceKey,
    ),
    /** Covers the inbox query: open items for a user, ordered by recency. */
    index("attention_user_res_dis_read_created_idx").on(
      table.userId,
      table.resolvedAt,
      table.dismissedAt,
      table.readAt,
      table.createdAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// reminders — date-based reminders on any entity (design D8/D14, task 11.1)
// ---------------------------------------------------------------------------
export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    /** Entity this reminder is attached to (ON DELETE CASCADE on purge). */
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** "interval" | "one_time". */
    kind: text("kind").notNull(),
    /** Interval count (only for kind = "interval"). */
    everyCount: integer("every_count"),
    /** "day" | "week" | "month" | "year" (only for kind = "interval"). */
    everyUnit: text("every_unit"),
    /** Next/current due calendar date `YYYY-MM-DD`. */
    dueOn: text("due_on").notNull(),
    /** Set when a one-time reminder is completed; null while open. */
    closedAt: integer("closed_at", tsMs),
    /** When it was last completed. */
    lastCompletedAt: integer("last_completed_at", tsMs),
    /** Who last completed it. RESTRICT because users are disabled, not deleted. */
    lastCompletedBy: text("last_completed_by").references(
      () => user.id,
      { onDelete: "restrict" },
    ),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
  },
  (table) => [
    /** Covers the due-feed / reminder-job queries on open reminders by due date. */
    index("reminders_closed_due_idx").on(table.closedAt, table.dueOn),
  ],
);

// ---------------------------------------------------------------------------
// reminder_recipients — explicit recipients per reminder (design D8/D14)
// ---------------------------------------------------------------------------
export const reminderRecipients = sqliteTable(
  "reminder_recipients",
  {
    reminderId: text("reminder_id")
      .notNull()
      .references(() => reminders.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.reminderId, table.userId] }),
    index("reminder_recipients_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// idempotency_keys — REST idempotency (design D13)
// ---------------------------------------------------------------------------
export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    apiKeyId: text("api_key_id").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    /** Stored response JSON so a replay returns the exact same body. */
    response: text("response", { mode: "json" })
      .$type<unknown>()
      .notNull(),
    createdAt: integer("created_at", tsMs).notNull().default(nowMs),
  },
  (table) => [primaryKey({ columns: [table.apiKeyId, table.key] })],
);

// ---------------------------------------------------------------------------
// job_runs — daily job tracking (design D8, D11)
// ---------------------------------------------------------------------------
export const jobRuns = sqliteTable("job_runs", {
  /** Job name, e.g. "trash-purge", "backup", "search-consistency". */
  name: text("name").primaryKey(),
  lastStartedAt: integer("last_started_at", tsMs),
  lastSucceededAt: integer("last_succeeded_at", tsMs),
  /** Last error message, if any. */
  lastError: text("last_error"),
});
