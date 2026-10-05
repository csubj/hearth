/**
 * Reminder procedures (tasks 11.1–11.4, design D8/D14).
 *
 * Shared reminder system for every module that enables `features.reminders`.
 * Every mutation goes through the write pipeline; authorization lives in the
 * middleware (member) plus feature gating via `assertEntityFeature`.
 *
 *  - list      GET    /entities/{id}/reminders      — all reminders on an entity
 *  - dueFeed   GET    /reminders/due-feed           — the personal due feed
 *  - create    POST   /entities/{id}/reminders
 *  - update    PATCH  /entities/{id}/reminders/{reminderId}
 *  - complete  POST   /entities/{id}/reminders/{reminderId}/complete
 *  - remove    DELETE /entities/{id}/reminders/{reminderId}
 */

import "server-only";

import { randomUUID } from "node:crypto";
import * as z from "zod";
import { ORPCError } from "@orpc/server";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { writeWithDb, type WriteContext } from "../write";
import { assertEntityFeature } from "../entity-feature";
import { buildScopeFilter } from "../scope";
import {
  addInterval,
  todayInZone,
  firstIntervalDueOn,
  type IntervalUnit,
} from "../../lib/dates";
import { db } from "../../db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Conn = import("better-sqlite3").Database;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getConn(tx: unknown): Conn {
  const dbc = db as unknown as { $client: Conn };
  const txc = tx as { $client?: Conn };
  return txc.$client ?? dbc.$client;
}

function conflict(message: string) {
  return new ORPCError("conflict", {
    status: ERROR_STATUS_MAP.conflict,
    message,
  });
}

function notFound(message: string) {
  return new ORPCError("not_found", {
    status: ERROR_STATUS_MAP.not_found,
    message,
  });
}

/** The calendar "today" in the instance time zone for a given timestamp. */
function calendarToday(now: number): string {
  return todayInZone(new Date(now));
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const kindEnum = z.enum(["interval", "one_time"]);
const unitEnum = z.enum(["day", "week", "month", "year"]);
const dueOnField = z
  .string()
  .regex(DATE_RE, "Must be a YYYY-MM-DD date");

const createInput = z
  .object({
    id: z.string(),
    title: z.string().min(1, "Title is required").max(200, "Title must be at most 200 characters"),
    kind: kindEnum,
    everyCount: z.number().int().min(1).optional(),
    everyUnit: unitEnum.optional(),
    dueOn: dueOnField.optional(),
    recipients: z.array(z.string()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "interval") {
      if (val.everyCount === undefined) {
        ctx.addIssue({ code: "custom", path: ["everyCount"], message: "Required for interval reminders." });
      }
      if (val.everyUnit === undefined) {
        ctx.addIssue({ code: "custom", path: ["everyUnit"], message: "Required for interval reminders." });
      }
    } else if (val.kind === "one_time" && val.dueOn === undefined) {
      ctx.addIssue({ code: "custom", path: ["dueOn"], message: "Required for one-time reminders." });
    }
  });

const updateInput = z
  .object({
    id: z.string(),
    reminderId: z.string(),
    title: z.string().min(1, "Title is required").max(200, "Title must be at most 200 characters").optional(),
    kind: kindEnum.optional(),
    everyCount: z.number().int().min(1).optional(),
    everyUnit: unitEnum.optional(),
    dueOn: dueOnField.optional(),
    recipients: z.array(z.string()).optional(),
  });

const reminderIdInput = z.object({
  id: z.string(),
  reminderId: z.string(),
});

interface ReminderRow {
  id: string;
  entity_id: string;
  title: string;
  kind: string;
  every_count: number | null;
  every_unit: string | null;
  due_on: string;
  closed_at: number | null;
  last_completed_at: number | null;
  last_completed_by: string | null;
  created_at: number;
}

/** Load a reminder row scoped to an entity, or throw not_found. */
function loadReminder(
  conn: Conn,
  reminderId: string,
  entityId: string,
): ReminderRow {
  const row = conn
    .prepare("SELECT * FROM reminders WHERE id = ? AND entity_id = ?")
    .get(reminderId, entityId) as ReminderRow | undefined;
  if (!row) {
    throw notFound("Reminder not found.");
  }
  return row;
}

/** Fetch the explicit recipients of a reminder as member objects. */
function reminderRecipients(
  conn: Conn,
  reminderId: string,
): Array<{ id: string; username: string; name: string }> {
  const rows = conn
    .prepare(
      `SELECT u.id, u.username, u.name
       FROM reminder_recipients rr
       JOIN user u ON u.id = rr.user_id
       WHERE rr.reminder_id = ? AND u.banned = 0
       ORDER BY u.name COLLATE NOCASE ASC`,
    )
    .all(reminderId) as Array<{ id: string; username: string; name: string }>;
  return rows;
}

/** Map a reminder row to its API shape (with explicit recipients). */
function mapReminder(conn: Conn, row: ReminderRow) {
  return {
    id: row.id,
    entityId: row.entity_id,
    title: row.title,
    kind: row.kind,
    everyCount: row.every_count,
    everyUnit: row.every_unit,
    dueOn: row.due_on,
    closedAt: row.closed_at,
    lastCompletedAt: row.last_completed_at,
    lastCompletedBy: row.last_completed_by,
    createdAt: row.created_at,
    recipients: reminderRecipients(conn, row.id),
  };
}

// ---------------------------------------------------------------------------
// list — all reminders on an entity (visible to everyone on the detail page)
// ---------------------------------------------------------------------------

export const list = member
  .route({ method: "GET", path: "/entities/{id}/reminders" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityFeature(input.id, "reminders");
    const conn = (db as unknown as { $client: Conn }).$client;
    const rows = conn
      .prepare(
        "SELECT * FROM reminders WHERE entity_id = ? ORDER BY due_on ASC",
      )
      .all(input.id) as ReminderRow[];
    return { data: rows.map((r) => mapReminder(conn, r)) };
  });

// ---------------------------------------------------------------------------
// dueFeed — the personal due feed (overdue first, then by due date)
// ---------------------------------------------------------------------------

const FEED_WINDOW_DAYS = 14;

export const dueFeed = member
  .route({ method: "GET", path: "/reminders/due-feed" })
  .input(z.object({}))
  .handler(({ context }) => {
    const conn = (db as unknown as { $client: Conn }).$client;
    const today = calendarToday(context.now);
    const windowEnd = addInterval(today, FEED_WINDOW_DAYS, "day");

    const whereClauses: string[] = [
      "r.closed_at IS NULL",
      "r.due_on <= ?",
      "e.deleted_at IS NULL",
      "e.archived_at IS NULL",
      // The current member is one of this reminder's resolved recipients.
      `(
        EXISTS (SELECT 1 FROM reminder_recipients rr
                JOIN user ru ON ru.id = rr.user_id
                WHERE rr.reminder_id = r.id AND ru.banned = 0 AND rr.user_id = ?)
        OR (
          NOT EXISTS (SELECT 1 FROM reminder_recipients rr WHERE rr.reminder_id = r.id)
          AND EXISTS (SELECT 1 FROM entity_assignees ea
                      JOIN user au ON au.id = ea.user_id
                      WHERE ea.entity_id = e.id AND au.banned = 0 AND ea.user_id = ?)
        )
        OR (
          NOT EXISTS (SELECT 1 FROM reminder_recipients rr WHERE rr.reminder_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM entity_assignees ea WHERE ea.entity_id = e.id)
        )
      )`,
    ];
    const params: unknown[] = [windowEnd, context.user.id, context.user.id];

    // Property scope (D7): apply the user's property scope, if any.
    const scope = buildScopeFilter(conn, context.user.id);
    if (scope.sql) {
      whereClauses.push(scope.sql);
      params.push(...scope.params);
    }

    const rows = conn
      .prepare(
        `SELECT r.*, e.title AS entity_title, e.type AS entity_type,
                e.place_id AS place_id
         FROM reminders r
         JOIN entities e ON e.id = r.entity_id
         WHERE ${whereClauses.join(" AND ")}
         ORDER BY CASE WHEN r.due_on < ? THEN 0 ELSE 1 END, r.due_on ASC, r.id ASC`,
      )
      .all(...params, today) as Array<ReminderRow & {
      entity_title: string;
      entity_type: string;
    }>;

    return {
      data: rows.map((r) => ({
        ...mapReminder(conn, r),
        entityTitle: r.entity_title,
        entityType: r.entity_type,
      })),
    };
  });

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export const create = member
  .route({ method: "POST", path: "/entities/{id}/reminders" })
  .input(createInput)
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "reminders");
    const reminderId = randomUUID();
    const today = calendarToday(context.now);

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "reminders");

        // Compute the due date (D14). Interval defaults to creation + one
        // interval; one-time requires a due date (validated by the schema).
        let dueOn: string;
        if (input.kind === "interval") {
          dueOn =
            input.dueOn ??
            firstIntervalDueOn(
              today,
              input.everyCount!,
              input.everyUnit as IntervalUnit,
            );
        } else {
          dueOn = input.dueOn!;
        }

        conn
          .prepare(
            `INSERT INTO reminders
             (id, entity_id, title, kind, every_count, every_unit, due_on, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            reminderId,
            input.id,
            input.title,
            input.kind,
            input.kind === "interval" ? input.everyCount : null,
            input.kind === "interval" ? input.everyUnit : null,
            dueOn,
            context.now,
          );

        if (input.recipients && input.recipients.length > 0) {
          // Validate each recipient is an active member, then store them.
          const insert = conn.prepare(
            "INSERT INTO reminder_recipients (reminder_id, user_id) VALUES (?, ?)",
          );
          for (const userId of input.recipients) {
            const member = conn
              .prepare("SELECT id FROM user WHERE id = ? AND banned = 0")
              .get(userId) as { id: string } | undefined;
            if (!member) {
              throw new ORPCError("validation_error", {
                status: ERROR_STATUS_MAP.validation_error,
                message: "Recipient is not an active member.",
                data: { details: [{ path: "recipients", message: "Not an active member." }] },
              });
            }
            insert.run(reminderId, userId);
          }
        }

        changes.touch(input.id);
        changes.addActivity({
          entityId: input.id,
          action: "reminder",
          diff: {
            reminder: {
              reminderId,
              prevDueOn: null,
              newDueOn: dueOn,
              prevClosedAt: null,
              newClosedAt: null,
              prevLastCompletedAt: null,
              newLastCompletedAt: null,
              prevLastCompletedBy: null,
              newLastCompletedBy: null,
            },
          },
        });
      },
    );

    // Return the created reminder.
    const conn = (db as unknown as { $client: Conn }).$client;
    const row = loadReminder(conn, reminderId, input.id);
    return mapReminder(conn, row);
  });

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

export const update = member
  .route({ method: "PATCH", path: "/entities/{id}/reminders/{reminderId}" })
  .input(updateInput)
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "reminders");

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "reminders");
        const current = loadReminder(conn, input.reminderId, input.id);
        if (current.closed_at !== null) {
          throw conflict("A completed reminder cannot be edited.");
        }

        const kind = input.kind ?? current.kind;
        const everyCount = input.everyCount ?? current.every_count;
        const everyUnit = input.everyUnit ?? current.every_unit;
        let dueOn = input.dueOn ?? current.due_on;

        // Interval recomputes from the last completion (or creation) when the
        // interval changes (D14). Here we keep the existing due date unless the
        // caller explicitly supplies one or changes the interval, in which case
        // we recompute from the last completion (or creation).
        if (
          (input.everyCount !== undefined && input.everyCount !== current.every_count) ||
          (input.everyUnit !== undefined && input.everyUnit !== current.every_unit)
        ) {
          const base =
            current.last_completed_at !== null
              ? calendarToday(current.last_completed_at)
              : calendarToday(current.created_at);
          dueOn = addInterval(base, everyCount!, everyUnit as IntervalUnit);
        }

        if (kind === "one_time" && !dueOn) {
          throw new ORPCError("validation_error", {
            status: ERROR_STATUS_MAP.validation_error,
            message: "A one-time reminder requires a due date.",
            data: { details: [{ path: "dueOn", message: "Required for one-time reminders." }] },
          });
        }

        conn
          .prepare(
            `UPDATE reminders
             SET title = ?, kind = ?, every_count = ?, every_unit = ?, due_on = ?
             WHERE id = ?`,
          )
          .run(
            input.title ?? current.title,
            kind,
            kind === "interval" ? everyCount : null,
            kind === "interval" ? everyUnit : null,
            dueOn,
            input.reminderId,
          );

        // Replace explicit recipients if supplied.
        if (input.recipients !== undefined) {
          conn
            .prepare("DELETE FROM reminder_recipients WHERE reminder_id = ?")
            .run(input.reminderId);
          if (input.recipients.length > 0) {
            const insert = conn.prepare(
              "INSERT INTO reminder_recipients (reminder_id, user_id) VALUES (?, ?)",
            );
            for (const userId of input.recipients) {
              const member = conn
                .prepare("SELECT id FROM user WHERE id = ? AND banned = 0")
                .get(userId) as { id: string } | undefined;
              if (!member) {
                throw new ORPCError("validation_error", {
                  status: ERROR_STATUS_MAP.validation_error,
                  message: "Recipient is not an active member.",
                  data: { details: [{ path: "recipients", message: "Not an active member." }] },
                });
              }
              insert.run(input.reminderId, userId);
            }
          }
        }

        changes.touch(input.id);
        changes.addActivity({
          entityId: input.id,
          action: "reminder",
          diff: {
            reminder: {
              reminderId: input.reminderId,
              prevDueOn: current.due_on,
              newDueOn: dueOn,
              prevClosedAt: current.closed_at,
              newClosedAt: current.closed_at,
              prevLastCompletedAt: current.last_completed_at,
              newLastCompletedAt: current.last_completed_at,
              prevLastCompletedBy: current.last_completed_by,
              newLastCompletedBy: current.last_completed_by,
            },
          },
        });
      },
    );

    const conn = (db as unknown as { $client: Conn }).$client;
    const row = loadReminder(conn, input.reminderId, input.id);
    return mapReminder(conn, row);
  });

// ---------------------------------------------------------------------------
// complete — record completion, reschedule or close, clear open inbox items
// ---------------------------------------------------------------------------

export const complete = member
  .route({ method: "POST", path: "/entities/{id}/reminders/{reminderId}/complete" })
  .input(reminderIdInput)
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "reminders");

    const result = await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "reminders");
        const current = loadReminder(conn, input.reminderId, input.id);
        if (current.closed_at !== null) {
          throw conflict("This reminder has already been completed.");
        }

        const completedAt = context.now;
        let newDueOn = current.due_on;
        let newClosedAt: number | null = null;

        if (current.kind === "interval") {
          // Reschedule from the completion date (D14).
          const completionDate = calendarToday(completedAt);
          newDueOn = addInterval(
            completionDate,
            current.every_count!,
            current.every_unit as IntervalUnit,
          );
        } else {
          // One-time: close.
          newClosedAt = completedAt;
        }

        conn
          .prepare(
            `UPDATE reminders
             SET due_on = ?, closed_at = ?, last_completed_at = ?, last_completed_by = ?
             WHERE id = ?`,
          )
          .run(
            newDueOn,
            newClosedAt,
            completedAt,
            context.user.id,
            input.reminderId,
          );

        // Clear this reminder's open attention items for all members (D14).
        conn
          .prepare(
            `UPDATE attention SET resolved_at = ?
             WHERE source_type = 'reminder' AND source_id = ?
               AND resolved_at IS NULL`,
          )
          .run(completedAt, input.reminderId);

        changes.touch(input.id);
        const diff = {
          reminder: {
            reminderId: input.reminderId,
            prevDueOn: current.due_on,
            newDueOn,
            prevClosedAt: current.closed_at,
            newClosedAt,
            prevLastCompletedAt: current.last_completed_at,
            newLastCompletedAt: completedAt,
            prevLastCompletedBy: current.last_completed_by,
            newLastCompletedBy: context.user.id,
          },
        };
        changes.addActivity({
          entityId: input.id,
          action: "reminder-complete",
          diff,
        });
      },
    );

    void result;
    const conn = (db as unknown as { $client: Conn }).$client;
    const row = loadReminder(conn, input.reminderId, input.id);
    return mapReminder(conn, row);
  });

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export const remove = member
  .route({ method: "DELETE", path: "/entities/{id}/reminders/{reminderId}" })
  .input(reminderIdInput)
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "reminders");

    await writeWithDb(
      db,
      context as WriteContext,
      (tx, changes) => {
        const conn = getConn(tx);
        assertEntityFeature(input.id, "reminders");
        loadReminder(conn, input.reminderId, input.id);
        conn
          .prepare("DELETE FROM reminder_recipients WHERE reminder_id = ?")
          .run(input.reminderId);
        conn
          .prepare(
            "UPDATE attention SET resolved_at = ? WHERE source_type = 'reminder' AND source_id = ? AND resolved_at IS NULL",
          )
          .run(context.now, input.reminderId);
        conn
          .prepare("DELETE FROM reminders WHERE id = ?")
          .run(input.reminderId);
        changes.touch(input.id);
        changes.addActivity({
          entityId: input.id,
          action: "reminder",
          diff: {
            reminder: { reminderId: input.reminderId, removed: true },
          },
        });
      },
    );

    return { ok: true };
  });
