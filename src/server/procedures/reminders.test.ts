/**
 * Tests for reminders (tasks 11.2–11.4, design D8/D14).
 *
 *  - 11.2 recipient resolution + completion (reschedule/close, clear open
 *    inbox items, undoable).
 *  - 11.3 reminder job: idempotent attention per recipient per due date,
 *    paused for archived/trashed entities, catch-up after downtime.
 *  - 11.4 due feed: overdue-first ordering, someone else's reminder absent
 *    from my feed but visible on the entity detail page, property scope.
 */

import "server-only";
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "file::memory:?cache=shared";
});

import { randomUUID } from "node:crypto";
import { createRouterClient } from "@orpc/server";

import { validationInterceptor } from "../orpc";
import type { AppContext } from "../context";
import { router } from "../router";
import { db, sqlite } from "../../db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { MIGRATIONS_FOLDER } from "../../db/testing";
import {
  processDueReminders,
  resolveReminderRecipients,
} from "../reminders";
import { _clearJobs, registerJob, setConnection, tick } from "../jobs";

// Fixed clock so "today" is deterministic in the default UTC time zone.
const NOW_MS = new Date("2025-03-10T12:00:00Z").getTime();
const NOW = new Date(NOW_MS);

const PREFIX = randomUUID().slice(0, 8);
const CJ = `u-cj-${PREFIX}`;
const SAM = `u-sam-${PREFIX}`;

beforeAll(() => {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  insertUser(CJ, "CJ", "cj", "admin");
  insertUser(SAM, "Sam", "sam", "user");
});

// The global in-memory DB is shared across tests; reset mutable per-test state
// (user ban flags and CJ's property scope) so tests stay independent.
beforeEach(() => {
  sqlite.prepare("UPDATE user SET banned = 0 WHERE id IN (?, ?)").run(CJ, SAM);
  sqlite.prepare("DELETE FROM user_preferences WHERE user_id = ?").run(CJ);
});

function insertUser(id: string, name: string, username: string, role: string) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO user
       (id, name, email, email_verified, created_at, updated_at, username, role, banned)
       VALUES (?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000, ?, ?, 0)`,
    )
    .run(id, name, `${username}-${PREFIX}@users.hearth.invalid`, username, role);
}

function ctx(userId = CJ, via: AppContext["via"] = "web"): AppContext {
  return {
    user: {
      id: userId,
      name: userId === CJ ? "CJ" : "Sam",
      email: `${userId}@users.hearth.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: userId === CJ ? "admin" : "user",
    } as AppContext["user"],
    via,
    now: NOW_MS,
    requestId: randomUUID(),
  };
}

function client(userId = CJ) {
  return createRouterClient(router, {
    context: ctx(userId),
    interceptors: [validationInterceptor],
  });
}

type Client = ReturnType<typeof client>;

async function proc(c: Client, key: string, input: Record<string, unknown>) {
  return (c as unknown as Record<string, CallableFunction>)[key](input);
}

async function createNote(clientC = client(), title = "Note"): Promise<string> {
  const res = (await proc(clientC, "notesPageCreate", { title })) as { id: string };
  return res.id;
}

/** Count reminder attention for a user on a specific reminder, optionally resolved. */
function countAttention(
  userId: string,
  reminderId: string,
  resolved = false,
): number {
  const resolvedSql = resolved ? "IS NOT NULL" : "IS NULL";
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM attention at
       JOIN entities e ON e.id = at.entity_id
       WHERE at.user_id = ? AND at.reason = 'reminder'
         AND at.source_id = ? AND e.deleted_at IS NULL
         AND at.resolved_at ${resolvedSql}`,
    )
    .get(userId, reminderId) as { c: number };
  return row.c;
}

function setDueOn(reminderId: string, dueOn: string) {
  sqlite.prepare("UPDATE reminders SET due_on = ? WHERE id = ?").run(dueOn, reminderId);
}

function getReminder(reminderId: string) {
  return sqlite
    .prepare("SELECT * FROM reminders WHERE id = ?")
    .get(reminderId) as {
    due_on: string;
    kind: string;
    every_count: number | null;
    every_unit: string | null;
    closed_at: number | null;
    last_completed_at: number | null;
    last_completed_by: string | null;
  };
}

// ---------------------------------------------------------------------------
// 11.2 completion
// ---------------------------------------------------------------------------

describe("11.2 completion", () => {
  it("completing an interval reminder reschedules from the completion date and records who/when", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Water",
      kind: "interval",
      everyCount: 1,
      everyUnit: "week",
    })) as { id: string; dueOn: string };
    // Default first due date = creation (2025-03-10) + 1 week.
    expect(reminder.dueOn).toBe("2025-03-17");
    setDueOn(reminder.id, "2025-03-01");

    const completed = (await proc(c, "remindersComplete", {
      id,
      reminderId: reminder.id,
    })) as { dueOn: string; closedAt: number | null };
    expect(completed.dueOn).toBe("2025-03-17"); // completion date + 1 week
    expect(completed.closedAt).toBeNull();

    const row = getReminder(reminder.id);
    expect(row.last_completed_at).toBe(NOW_MS);
    expect(row.last_completed_by).toBe(CJ);

    // Completion appears in activity.
    const feed = (await proc(client(), "listActivity", { entityId: id })) as {
      data: Array<{ action: string; diff: Record<string, unknown> }>;
    };
    expect(feed.data.some((e) => e.action === "reminder-complete")).toBe(true);
  });

  it("completing a one-time reminder closes it and clears its open inbox items", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Call plumber",
      kind: "one_time",
      dueOn: "2025-03-05",
      recipients: [CJ],
    })) as { id: string };
    // Turn into attention via the job.
    processDueReminders(sqlite, NOW);
    expect(countAttention(CJ, reminder.id)).toBe(1);

    await proc(c, "remindersComplete", { id, reminderId: reminder.id });
    const row = getReminder(reminder.id);
    expect(row.closed_at).toBe(NOW_MS);
    // Completion clears the open inbox item for this reminder.
    expect(countAttention(CJ, reminder.id)).toBe(0);
    expect(countAttention(CJ, reminder.id, true)).toBe(1);
  });

  it("a completed one-time reminder is not completed again (conflict)", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "One",
      kind: "one_time",
      dueOn: "2025-03-05",
    })) as { id: string };
    await proc(c, "remindersComplete", { id, reminderId: reminder.id });
    await expect(
      proc(c, "remindersComplete", { id, reminderId: reminder.id }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("a reminder completion undo restores the previous due date", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Water",
      kind: "interval",
      everyCount: 1,
      everyUnit: "month",
      dueOn: "2025-01-31",
    })) as { id: string };
    // Force an overdue due date so completion reschedules.
    setDueOn(reminder.id, "2025-02-01");

    await proc(c, "remindersComplete", { id, reminderId: reminder.id });
    const completed = getReminder(reminder.id);
    expect(completed.due_on).toBe("2025-04-10"); // completion 2025-03-10 + 1 month

    // Find and undo the completion activity entry.
    const feed = (await proc(client(), "listActivity", { entityId: id })) as {
      data: Array<{ id: string; action: string; diff: Record<string, unknown> }>;
    };
    const completion = feed.data.find(
      (e) =>
        e.action === "reminder-complete" &&
        (e.diff.reminder as { reminderId?: string } | undefined)?.reminderId ===
          reminder.id,
    )!;
    await proc(client(), "activityUndo", { id: completion.id });

    const undone = getReminder(reminder.id);
    expect(undone.due_on).toBe("2025-02-01");
    expect(undone.last_completed_at).toBeNull();
  });

  it("refuses to undo a completion when the reminder changed since", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Water",
      kind: "interval",
      everyCount: 1,
      everyUnit: "month",
      dueOn: "2025-02-01",
    })) as { id: string };

    await proc(c, "remindersComplete", { id, reminderId: reminder.id });
    // Someone edits the reminder after completion → the due date changes.
    await proc(c, "remindersUpdate", {
      id,
      reminderId: reminder.id,
      dueOn: "2025-06-01",
    });

    const feed = (await proc(client(), "listActivity", { entityId: id })) as {
      data: Array<{ id: string; action: string; diff: Record<string, unknown> }>;
    };
    const completion = feed.data.find(
      (e) =>
        e.action === "reminder-complete" &&
        (e.diff.reminder as { reminderId?: string } | undefined)?.reminderId ===
          reminder.id,
    )!;

    await expect(
      proc(client(), "activityUndo", { id: completion.id }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

// ---------------------------------------------------------------------------
// 11.3 reminder job
// ---------------------------------------------------------------------------

describe("11.3 reminder job", () => {
  beforeEach(() => {
    setConnection(sqlite);
    _clearJobs();
    registerJob({
      name: "reminders",
      frequency: "every-tick",
      run: (now, conn) => {
        processDueReminders(conn, now);
      },
    });
  });

  afterEach(() => {
    setConnection(null);
  });

  it("repeated runs create exactly one attention item per recipient per due date", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Oil filter",
      kind: "interval",
      everyCount: 1,
      everyUnit: "month",
      dueOn: "2025-03-01",
      recipients: [CJ, SAM],
    })) as { id: string };

    await tick(NOW);
    await tick(NOW);
    await tick(NOW);

    expect(countAttention(CJ, reminder.id)).toBe(1);
    expect(countAttention(SAM, reminder.id)).toBe(1);
  });

  it("a reminder on an archived entity creates nothing and is paused", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Suspended",
      kind: "one_time",
      dueOn: "2025-03-01",
    })) as { id: string };

    await proc(c, "notesPageArchive", { id });
    await tick(NOW);
    expect(countAttention(CJ, reminder.id)).toBe(0);
    expect(countAttention(SAM, reminder.id)).toBe(0);

    // Unarchive → it resumes.
    await proc(c, "notesPageUnarchive", { id });
    await tick(NOW);
    expect(countAttention(CJ, reminder.id)).toBe(1);
  });

  it("a reminder that came due while stopped is processed at the startup tick", async () => {
    // Reminder due while "stopped" (no ticks ran for it).
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Catch up",
      kind: "one_time",
      dueOn: "2025-01-01", // came due a long time ago
    })) as { id: string };
    expect(countAttention(CJ, reminder.id)).toBe(0);

    // First tick after startup processes it.
    await tick(NOW);
    expect(countAttention(CJ, reminder.id)).toBe(1);
  });

  it("resolves recipients: explicit → assignees → all active members", async () => {
    const c = client();
    const idA = await createNote();
    const explicit = (await proc(c, "remindersCreate", {
      id: idA,
      title: "Explicit",
      kind: "one_time",
      dueOn: "2025-03-01",
      recipients: [SAM],
    })) as { id: string };
    expect(resolveReminderRecipients(sqlite, explicit.id, idA)).toEqual([SAM]);

    // No explicit recipients, but an assignee (CJ only) → fall back to assignees.
    const idB = await createNote();
    await proc(c, "addAssignee", { id: idB, userId: CJ });
    const assigned = (await proc(c, "remindersCreate", {
      id: idB,
      title: "Assigned",
      kind: "one_time",
      dueOn: "2025-03-01",
    })) as { id: string };
    expect(resolveReminderRecipients(sqlite, assigned.id, idB)).toEqual([CJ]);

    // No recipients and no assignees → all active members.
    const idC = await createNote();
    const all = (await proc(c, "remindersCreate", {
      id: idC,
      title: "All",
      kind: "one_time",
      dueOn: "2025-03-01",
    })) as { id: string };
    expect(
      resolveReminderRecipients(sqlite, all.id, idC).sort(),
    ).toEqual([CJ, SAM].sort());
  });

  it("a disabled recipient is skipped", async () => {
    const id = await createNote();
    const c = client();
    const reminder = (await proc(c, "remindersCreate", {
      id,
      title: "Disabled",
      kind: "one_time",
      dueOn: "2025-03-01",
      recipients: [SAM, CJ],
    })) as { id: string };
    // Disable Sam.
    sqlite.prepare("UPDATE user SET banned = 1 WHERE id = ?").run(SAM);

    await tick(NOW);
    expect(countAttention(CJ, reminder.id)).toBe(1);
    expect(countAttention(SAM, reminder.id)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 11.4 due feed
// ---------------------------------------------------------------------------

describe("11.4 due feed", () => {
  it("lists overdue reminders first, then by due date, within the window", async () => {
    const id = await createNote();
    const c = client();
    const overdue = (await proc(c, "remindersCreate", {
      id,
      title: "Overdue",
      kind: "one_time",
      dueOn: "2025-03-01",
    })) as { id: string };
    const tomorrow = (await proc(c, "remindersCreate", {
      id,
      title: "Tomorrow",
      kind: "one_time",
      dueOn: "2025-03-11",
    })) as { id: string };

    const feed = (await proc(client(), "remindersDueFeed", {})) as {
      data: Array<{ id: string; title: string; dueOn: string }>;
    };
    const titles = feed.data.map((r) => r.title);
    // Overdue is before the one due tomorrow.
    expect(titles.indexOf("Overdue")).toBeLessThan(titles.indexOf("Tomorrow"));
    // Both are present (within the 14-day window).
    expect(feed.data.map((r) => r.id)).toContain(overdue.id);
    expect(feed.data.map((r) => r.id)).toContain(tomorrow.id);
  });

  it("does not include a reminder due beyond the 14-day window", async () => {
    const id = await createNote();
    const c = client();
    await proc(c, "remindersCreate", {
      id,
      title: "Far future",
      kind: "one_time",
      dueOn: "2025-04-01", // beyond 2025-03-24 (today + 14 days)
    });
    const feed = (await proc(client(), "remindersDueFeed", {})) as {
      data: Array<{ title: string }>;
    };
    expect(feed.data.map((r) => r.title)).not.toContain("Far future");
  });

  it("someone else's reminder is absent from my feed but visible on the entity detail page", async () => {
    const id = await createNote();
    const c = client();
    await proc(c, "remindersCreate", {
      id,
      title: "Only Sam",
      kind: "one_time",
      dueOn: "2025-03-01",
      recipients: [SAM],
    });

    // CJ's feed does not include it.
    const cjFeed = (await proc(client(CJ), "remindersDueFeed", {})) as {
      data: Array<{ title: string }>;
    };
    expect(cjFeed.data.map((r) => r.title)).not.toContain("Only Sam");

    // Sam's feed does include it.
    const samFeed = (await proc(client(SAM), "remindersDueFeed", {})) as {
      data: Array<{ title: string }>;
    };
    expect(samFeed.data.map((r) => r.title)).toContain("Only Sam");

    // Everyone sees it on the entity detail page.
    const detail = (await proc(client(CJ), "remindersList", { id })) as {
      data: Array<{ title: string }>;
    };
    expect(detail.data.map((r) => r.title)).toContain("Only Sam");
  });

  it("excludes reminders on entities outside the current property scope", async () => {
    const propA = randomUUID();
    const propB = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO entities (id, type, title, created_by, updated_by)
         VALUES (?, 'place', ?, ?, ?)`,
      )
      .run(propA, "Property A", CJ, CJ);
    sqlite
      .prepare(
        `INSERT INTO places (entity_id, kind, path) VALUES (?, 'property', ?)`,
      )
      .run(propA, `/${propA}/`);
    sqlite
      .prepare(
        `INSERT INTO entities (id, type, title, created_by, updated_by)
         VALUES (?, 'place', ?, ?, ?)`,
      )
      .run(propB, "Property B", CJ, CJ);
    sqlite
      .prepare(
        `INSERT INTO places (entity_id, kind, path) VALUES (?, 'property', ?)`,
      )
      .run(propB, `/${propB}/`);

    // Place a notes-page entity under property A.
    const id = await createNote(client(), "Scoped Note");
    sqlite
      .prepare("UPDATE entities SET place_id = ? WHERE id = ?")
      .run(propA, id);
    await proc(client(), "remindersCreate", {
      id,
      title: "Scoped",
      kind: "one_time",
      dueOn: "2025-03-01",
    });

    // Default scope (All) shows it.
    const allFeed = (await proc(client(), "remindersDueFeed", {})) as {
      data: Array<{ title: string }>;
    };
    expect(allFeed.data.map((r) => r.title)).toContain("Scoped");

    // Scope to property B → it disappears from the feed.
    sqlite
      .prepare(
        `INSERT INTO user_preferences (user_id, property_scope) VALUES (?, ?)
         ON CONFLICT (user_id) DO UPDATE SET property_scope = excluded.property_scope`,
      )
      .run(CJ, propB);

    const scopedFeed = (await proc(client(), "remindersDueFeed", {})) as {
      data: Array<{ title: string }>;
    };
    expect(scopedFeed.data.map((r) => r.title)).not.toContain("Scoped");
  });
});
