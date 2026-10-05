/**
 * Root oRPC router (task 3.2 + 3.4 + 5.1 + 5.2 + 5.3 + 6.2).
 *
 * Contains demo procedures (`ping`, `me`, `echo`) used by tests to exercise
 * the middleware, error, and adapter infrastructure, admin user management
 * procedures (task 5.1), self-service settings procedures (task 5.2),
 * API key management procedures (task 5.3), and module procedures
 * generated from the registry (task 6.2).
 */

import * as z from "zod";
import { base, member, sessionOnly } from "./orpc";
import * as adminUsers from "./procedures/admin-users";
import * as settings from "./procedures/settings";
import * as apiKeys from "./procedures/api-keys";
import * as trash from "./procedures/trash";
import * as places from "./procedures/places";
import * as tags from "./procedures/tags";
import * as links from "./procedures/links";
import * as urls from "./procedures/urls";
import * as attachments from "./procedures/attachments";
import * as collaboration from "./procedures/collaboration";
import * as activity from "./procedures/activity";
import * as inbox from "./procedures/inbox";
import * as reminders from "./procedures/reminders";
import * as search from "./procedures/search";
import * as pins from "./procedures/pins";
import { generateAllModuleProcedures } from "./procedures/module";
import { registry } from "../modules/registry";

// ---------------------------------------------------------------------------
// Demo procedures (test scaffolding only)
// ---------------------------------------------------------------------------

/**
 * `ping` — public procedure, no auth required.
 * Returns `{ ok: true, requestId }` so callers can verify the context is
 * threaded correctly.
 */
const ping = base
  .route({ method: "GET", path: "/ping" })
  .input(z.object({ echo: z.string().optional() }))
  .handler(({ context, input }) => ({
    ok: true as const,
    echo: input.echo ?? null,
    requestId: context.requestId,
  }));

/**
 * `me` — session-only procedure (web callers only; API-key callers get 403).
 * Returns basic user info so tests can verify the session guard.
 */
const me = sessionOnly
  .route({ method: "GET", path: "/me" })
  .input(z.object({}))
  .handler(({ context }) => {
    // username is added by the Better Auth username plugin at runtime;
    // role is from the admin plugin. Both are part of AuthUser at runtime.
    const u = context.user as typeof context.user & { username?: string | null };
    return {
      id: u.id,
      username: u.username ?? null,
      role: u.role ?? null,
    };
  });

/**
 * `echo` — member-only POST procedure with validation (task 3.4).
 * Exercises the validation path through all adapters. Requires a non-empty
 * `message` (string, min 1) and returns it back. Declared with a route so
 * the OpenAPIHandler can match it.
 */
const echo = member
  .route({ method: "POST", path: "/echo" })
  .input(
    z.object({
      message: z.string().min(1, "Message is required"),
    }),
  )
  .handler(({ context, input }) => ({
    message: input.message,
    requestId: context.requestId,
  }));

/**
 * `throwInternal` — test-only procedure that always throws an unknown error
 * (task 4.4). Used in logger tests to verify that the structured request log
 * emits a `level:"error"` line for 500 responses and that the `requestId`
 * in the log matches the `requestId` in the error response body.
 */
const throwInternal = base
  .route({ method: "GET", path: "/test/throw-internal" })
  .input(z.object({}))
  .handler((): never => {
    throw new Error("intentional internal error for structured logging test");
  });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module procedures generated from the registry (task 6.2)
// ---------------------------------------------------------------------------

const moduleProcedures = generateAllModuleProcedures(registry);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * The static portion of the router — every key is a known oRPC procedure.
 * Module procedures (dynamic, generated from the registry) are merged at
 * runtime but kept in a separate object so the static keys stay typed.
 */
const staticRouter = {
  ping,
  me,
  echo,
  throwInternal,
  // Admin user management (task 5.1)
  adminListUsers: adminUsers.listUsers,
  adminCreateUser: adminUsers.createUser,
  adminResetPassword: adminUsers.resetPassword,
  adminSetUserRole: adminUsers.setUserRole,
  adminDisableUser: adminUsers.disableUser,
  adminEnableUser: adminUsers.enableUser,
  // Self-service settings (task 5.2)
  getProfile: settings.getProfile,
  updateProfile: settings.updateProfile,
  getPreferences: settings.getPreferences,
  updatePreferences: settings.updatePreferences,
  changePassword: settings.changePassword,
  // API key management (task 5.3)
  listApiKeys: apiKeys.listApiKeys,
  createApiKey: apiKeys.createApiKey,
  revokeApiKey: apiKeys.revokeApiKey,
  // Trash (task 6.7)
  listTrashed: trash.listTrashed,
  restoreBatch: trash.restoreBatch,
  // Places (tasks 7.x)
  placesCreate: places.create,
  placesMove: places.move,
  placesTree: places.tree,
  placesRollup: places.rollup,
  placesDelete: places.del,
  placesRestore: places.restore,
  // Organization (tasks 8.x)
  tagsList: tags.list,
  tagsAdd: tags.add,
  tagsRemove: tags.remove,
  linksList: links.list,
  linksAdd: links.add,
  linksRemove: links.remove,
  urlsList: urls.list,
  urlsAdd: urls.add,
  urlsRemove: urls.remove,
  attachmentsList: attachments.list,
  attachmentsRemove: attachments.remove,
  // Collaboration (tasks 9.x)
  getNotes: collaboration.getNotes,
  saveNotes: collaboration.saveNotes,
  listComments: collaboration.listComments,
  createComment: collaboration.createComment,
  editComment: collaboration.editComment,
  deleteComment: collaboration.deleteComment,
  listAssignees: collaboration.listAssignees,
  addAssignee: collaboration.addAssignee,
  removeAssignee: collaboration.removeAssignee,
  listMembers: collaboration.listMembers,
  // Activity and undo (tasks 10.1–10.2)
  listActivity: activity.listActivity,
  activityUndo: activity.undo,
  // Inbox and bell (task 10.3)
  listInbox: inbox.list,
  inboxCount: inbox.count,
  inboxMarkRead: inbox.markRead,
  inboxMarkAllRead: inbox.markAllRead,
  inboxDismiss: inbox.dismiss,
  // Reminders (tasks 11.1–11.4)
  remindersList: reminders.list,
  remindersDueFeed: reminders.dueFeed,
  remindersCreate: reminders.create,
  remindersUpdate: reminders.update,
  remindersComplete: reminders.complete,
  remindersDelete: reminders.remove,
  // Search (task 12.2)
  search: search.search,
  // Pins (task 13.4)
  entityPin: pins.pin,
  entityUnpin: pins.unpin,
  listPinned: pins.listPinned,
  entityIsPinned: pins.isPinned,
};

export const router = {
  ...staticRouter,
  ...moduleProcedures,
};

export type AppRouter = typeof staticRouter;
