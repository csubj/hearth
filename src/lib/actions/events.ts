"use server";

import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { events, type Event } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

export type EventActionState = {
  error?: string;
  success?: string;
};

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const linkSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || z.string().url().safeParse(v).success, {
    message: "Link must be a valid URL",
  });

const eventFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  startsAt: z.string().min(1, "Date and time are required"),
  location: optionalText,
  link: linkSchema,
  note: optionalText,
});

function parseStartsAt(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function revalidateEventPaths(): void {
  revalidatePath("/events");
  revalidatePath("/");
}

export async function listUpcomingEvents(now = Date.now()): Promise<Event[]> {
  const db = getDb();
  return db
    .select()
    .from(events)
    .where(gte(events.startsAt, new Date(now)))
    .orderBy(asc(events.startsAt));
}

export async function listPastEvents(now = Date.now()): Promise<Event[]> {
  const db = getDb();
  return db
    .select()
    .from(events)
    .where(lt(events.startsAt, new Date(now)))
    .orderBy(desc(events.startsAt));
}

export async function listHomeEvents(now = Date.now()): Promise<Event[]> {
  const db = getDb();
  const horizon = now + 14 * 24 * 60 * 60 * 1000;
  return db
    .select()
    .from(events)
    .where(and(gte(events.startsAt, new Date(now)), lt(events.startsAt, new Date(horizon))))
    .orderBy(asc(events.startsAt))
    .limit(5);
}

export async function createEvent(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { user } = await requireUser();

  const parsed = eventFieldsSchema.safeParse({
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    location: formData.get("location"),
    link: formData.get("link"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const startsAt = parseStartsAt(parsed.data.startsAt);
  if (!startsAt) {
    return { error: "Invalid date and time" };
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const db = getDb();

  await db.insert(events).values({
    id,
    title: parsed.data.title,
    startsAt,
    location: parsed.data.location ?? null,
    link: parsed.data.link ?? null,
    note: parsed.data.note ?? null,
    createdByUserId: user.id,
    updatedByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  await emitHouseholdActivity({
    type: "event.created",
    actorId: user.id,
    entityType: "event",
    entityId: id,
    summary: `added event "${parsed.data.title}"`,
  });

  if (parsed.data.note) {
    await emitMentions({
      body: parsed.data.note,
      entityType: "event",
      entityId: id,
      actorId: user.id,
    });
  }

  revalidateEventPaths();
  return { success: "Event added" };
}

export async function updateEvent(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const { user } = await requireUser();
  const eventId = String(formData.get("eventId") ?? "");

  if (!eventId) {
    return { error: "Event is required" };
  }

  const parsed = eventFieldsSchema.safeParse({
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    location: formData.get("location"),
    link: formData.get("link"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const startsAt = parseStartsAt(parsed.data.startsAt);
  if (!startsAt) {
    return { error: "Invalid date and time" };
  }

  const db = getDb();
  const now = new Date();
  const updated = await db
    .update(events)
    .set({
      title: parsed.data.title,
      startsAt,
      location: parsed.data.location ?? null,
      link: parsed.data.link ?? null,
      note: parsed.data.note ?? null,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(events.id, eventId))
    .returning({ id: events.id, title: events.title });

  if (updated.length === 0) {
    return { error: "Event not found" };
  }

  await emitHouseholdActivity({
    type: "event.updated",
    actorId: user.id,
    entityType: "event",
    entityId: eventId,
    summary: `updated event "${updated[0]!.title}"`,
  });

  if (parsed.data.note) {
    await emitMentions({
      body: parsed.data.note,
      entityType: "event",
      entityId: eventId,
      actorId: user.id,
    });
  }

  revalidateEventPaths();
  return { success: "Event updated" };
}

export async function deleteEvent(
  _prev: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  await requireUser();
  const eventId = String(formData.get("eventId") ?? "");

  if (!eventId) {
    return { error: "Event is required" };
  }

  const db = getDb();
  const deleted = await db
    .delete(events)
    .where(eq(events.id, eventId))
    .returning({ id: events.id });

  if (deleted.length === 0) {
    return { error: "Event not found" };
  }

  revalidateEventPaths();
  return { success: "Event deleted" };
}
