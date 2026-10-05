/**
 * Attachment procedures (task 8.4, design D15).
 *
 * The upload itself (`uploadAttachment`) is a single implementation reused by
 * the REST multipart route and the web session route. These procedures cover
 * the list and removal operations; the streamed GET route serves files.
 *
 *  list   GET  /entities/{id}/attachments
 *  remove DELETE /entities/{id}/attachments/{attachmentId}   (soft delete)
 */

import "server-only";

import * as z from "zod";

import { member, ERROR_STATUS_MAP } from "../orpc";
import { ORPCError } from "@orpc/server";
import { writeWithDb, type WriteContext } from "../write";
import { assertEntityFeature } from "../entity-feature";
import { listAttachments, removeAttachment } from "../attachments";

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export const list = member
  .route({ method: "GET", path: "/entities/{id}/attachments" })
  .input(z.object({ id: z.string() }))
  .handler(({ input }) => {
    assertEntityFeature(input.id, "attachments");
    return { data: listAttachments(input.id) };
  });

// ---------------------------------------------------------------------------
// remove — soft delete (undoable, restorable for 30 days)
// ---------------------------------------------------------------------------

export const remove = member
  .route({ method: "DELETE", path: "/entities/{id}/attachments/{attachmentId}" })
  .input(z.object({ id: z.string(), attachmentId: z.string() }))
  .handler(async ({ context, input }) => {
    assertEntityFeature(input.id, "attachments");
    await removeAttachment(context as WriteContext, input.id, input.attachmentId);
    return { ok: true };
  });
