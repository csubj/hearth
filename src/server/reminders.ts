/**
 * Reminders shared server logic (design D8/D14, tasks 11.1–11.3).
 *
 *  - `resolveReminderRecipients` implements the recipient-resolution fallback:
 *    explicit active recipients → active assignees (of the entity) → all
 *    active members. Only active (non-banned) members are notified.
 *  - `processDueReminders` is the reminder job: for open reminders due on
 *    active entities it inserts one attention item per recipient per due date,
 *    deduplicated by the `reminder:<reminderId>:<dueOn>:<userId>` occurrence
 *    key (ON CONFLICT DO NOTHING).
 *
 * Both take an explicit better-sqlite3 connection so they work identically
 * inside a write transaction (`tx`) and inside the scheduler tick (`conn`).
 */

import "server-only";

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { todayInZone } from "../lib/dates";

/** The attention occurrence key for a reminder due date (design D8). */
export function reminderOccurrenceKey(
  reminderId: string,
  dueOn: string,
  userId: string,
): string {
  return `reminder:${reminderId}:${dueOn}:${userId}`;
}

/** All active member ids (non-banned) for a given connection. */
function activeMemberIds(conn: Database.Database): string[] {
  const rows = conn
    .prepare("SELECT id FROM user WHERE banned = 0")
    .all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Active assignee ids of an entity (non-banned). */
function activeAssigneeIds(
  conn: Database.Database,
  entityId: string,
): string[] {
  const rows = conn
    .prepare(
      `SELECT ea.user_id FROM entity_assignees ea
       JOIN user u ON u.id = ea.user_id
       WHERE ea.entity_id = ? AND u.banned = 0`,
    )
    .all(entityId) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

/** Active explicit recipients of a reminder (non-banned). */
function activeExplicitRecipients(
  conn: Database.Database,
  reminderId: string,
): string[] {
  const rows = conn
    .prepare(
      `SELECT rr.user_id FROM reminder_recipients rr
       JOIN user u ON u.id = rr.user_id
       WHERE rr.reminder_id = ? AND u.banned = 0`,
    )
    .all(reminderId) as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

/**
 * Resolve the recipients for a reminder: explicit active recipients → active
 * assignees → all active members (design D14). Only active members are
 * included, so a disabled recipient is simply skipped.
 */
export function resolveReminderRecipients(
  conn: Database.Database,
  reminderId: string,
  entityId: string,
): string[] {
  const explicit = activeExplicitRecipients(conn, reminderId);
  if (explicit.length > 0) return explicit;

  const assignees = activeAssigneeIds(conn, entityId);
  if (assignees.length > 0) return assignees;

  return activeMemberIds(conn);
}

/**
 * Run the reminder job: process every open reminder whose `due_on` is today or
 * earlier and whose entity is active (not archived, not trashed). For each
 * resolved recipient, insert a single attention item keyed by the occurrence
 * key with `ON CONFLICT DO NOTHING`, so repeated ticks create at most one item
 * per recipient per due date. Reminders on archived/trashed entities are
 * paused (they create nothing) and resume when the entity is unarchived or
 * restored.
 *
 * Returns the number of attention items inserted (0 for an already-processed /
 * paused reminder), which makes the job idempotency testable.
 */
export function processDueReminders(
  conn: Database.Database,
  now: Date,
): number {
  const today = todayInZone(now);
  const due = conn
    .prepare(
      `SELECT r.id, r.entity_id, r.due_on
       FROM reminders r
       JOIN entities e ON e.id = r.entity_id
       WHERE r.closed_at IS NULL
         AND r.due_on <= ?
         AND e.deleted_at IS NULL
         AND e.archived_at IS NULL`,
    )
    .all(today) as Array<{ id: string; entity_id: string; due_on: string }>;

  const insert = conn.prepare(
    `INSERT INTO attention
     (id, user_id, reason, entity_id, source_type, source_id, occurrence_key, created_at)
     VALUES (?, ?, 'reminder', ?, 'reminder', ?, ?, ?)
     ON CONFLICT (user_id, occurrence_key) DO NOTHING`,
  );

  let inserted = 0;
  for (const reminder of due) {
    const recipients = resolveReminderRecipients(
      conn,
      reminder.id,
      reminder.entity_id,
    );
    for (const userId of recipients) {
      const result = insert.run(
        randomUUID(),
        userId,
        reminder.entity_id,
        reminder.id,
        reminderOccurrenceKey(reminder.id, reminder.due_on, userId),
        now.getTime(),
      );
      inserted += result.changes;
    }
  }

  return inserted;
}
