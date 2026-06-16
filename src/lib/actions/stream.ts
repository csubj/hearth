"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { streamEntries } from "@/db/schema";
import { requireUser, displayName } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

export type StreamActionState = {
  error?: string;
};

const bodyField = z.string().trim().min(1, "Note is required").max(10_000);
const roughWhenField = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => value || null);

const createEntrySchema = z.object({
  body: bodyField,
  roughWhen: roughWhenField,
});

const updateEntrySchema = z.object({
  id: z.string().uuid(),
  body: bodyField,
  roughWhen: roughWhenField,
});

const idSchema = z.object({
  id: z.string().uuid(),
});

function revalidateStreamPaths(): void {
  revalidatePath("/stream");
  revalidatePath("/");
}

export async function createEntry(
  _prev: StreamActionState,
  formData: FormData,
): Promise<StreamActionState> {
  const { user } = await requireUser();

  const parsed = createEntrySchema.safeParse({
    body: formData.get("body"),
    roughWhen: formData.get("roughWhen") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const { body, roughWhen } = parsed.data;

  await getDb().insert(streamEntries).values({
    id,
    body,
    roughWhen,
    isPinned: false,
    createdByUserId: user.id,
    updatedByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const name = displayName(user);
  await emitHouseholdActivity({
    type: "stream.created",
    actorId: user.id,
    entityType: "stream_entry",
    entityId: id,
    summary: `${name} added a stream note`,
  });
  await emitMentions({
    body,
    entityType: "stream_entry",
    entityId: id,
    actorId: user.id,
  });

  revalidateStreamPaths();
  return {};
}

export async function updateEntry(
  _prev: StreamActionState,
  formData: FormData,
): Promise<StreamActionState> {
  const { user } = await requireUser();

  const parsed = updateEntrySchema.safeParse({
    id: formData.get("id"),
    body: formData.get("body"),
    roughWhen: formData.get("roughWhen") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { id, body, roughWhen } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(streamEntries).where(eq(streamEntries.id, id)).limit(1);

  if (!existing) {
    return { error: "Entry not found" };
  }

  const now = new Date();
  await db
    .update(streamEntries)
    .set({ body, roughWhen, updatedByUserId: user.id, updatedAt: now })
    .where(eq(streamEntries.id, id));

  const name = displayName(user);
  await emitHouseholdActivity({
    type: "stream.updated",
    actorId: user.id,
    entityType: "stream_entry",
    entityId: id,
    summary: `${name} updated a stream note`,
  });
  await emitMentions({
    body,
    entityType: "stream_entry",
    entityId: id,
    actorId: user.id,
  });

  revalidateStreamPaths();
  return {};
}

export async function togglePin(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return;
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(streamEntries)
    .where(eq(streamEntries.id, parsed.data.id))
    .limit(1);

  if (!existing) {
    return;
  }

  const now = new Date();
  await db
    .update(streamEntries)
    .set({
      isPinned: !existing.isPinned,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(streamEntries.id, parsed.data.id));

  revalidateStreamPaths();
}

export async function markDone(formData: FormData): Promise<void> {
  const { user } = await requireUser();

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return;
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(streamEntries)
    .where(eq(streamEntries.id, parsed.data.id))
    .limit(1);

  if (!existing || existing.doneAt) {
    return;
  }

  const now = new Date();
  await db
    .update(streamEntries)
    .set({
      doneAt: now,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(streamEntries.id, parsed.data.id));

  const name = displayName(user);
  await emitHouseholdActivity({
    type: "stream.done",
    actorId: user.id,
    entityType: "stream_entry",
    entityId: parsed.data.id,
    summary: `${name} marked a stream note done`,
  });

  revalidateStreamPaths();
}
