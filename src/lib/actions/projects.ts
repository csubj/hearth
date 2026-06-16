"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { PROJECT_STATUSES, projects, type ProjectStatus } from "@/db/schema";
import { displayName, requireUser } from "@/lib/auth/session";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

export type ProjectActionState = {
  error?: string;
  success?: string;
};

const titleSchema = z.string().trim().min(1, "Title is required").max(200);
const descriptionSchema = z.string().trim().max(5000).optional();
const statusSchema = z.enum(PROJECT_STATUSES);

function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case "idea":
      return "Idea";
    case "in_progress":
      return "In progress";
    case "done":
      return "Done";
  }
}

export async function create(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      title: titleSchema,
      description: descriptionSchema,
      status: statusSchema.optional(),
    })
    .safeParse({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
      status: String(formData.get("status") ?? "idea") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { title, description, status = "idea" } = parsed.data;
  const now = new Date();
  const id = crypto.randomUUID();

  await getDb()
    .insert(projects)
    .values({
      id,
      title,
      description: description ?? null,
      status,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "project.created",
    actorId: user.id,
    entityType: "project",
    entityId: id,
    summary: `${actor} added "${title}"`,
  });

  if (description) {
    await emitMentions({
      body: description,
      entityType: "project",
      entityId: id,
      actorId: user.id,
    });
  }

  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/projects/${id}`);
}

export async function update(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      id: z.string().uuid(),
      title: titleSchema,
      description: descriptionSchema,
    })
    .safeParse({
      id: String(formData.get("id") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { id, title, description } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

  if (!existing) {
    return { error: "Project not found" };
  }

  const now = new Date();
  await db
    .update(projects)
    .set({
      title,
      description: description ?? null,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(projects.id, id));

  await emitMentions({
    body: description ?? "",
    entityType: "project",
    entityId: id,
    actorId: user.id,
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
  return { success: "Project updated" };
}

export async function setStatus(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      id: z.string().uuid(),
      status: statusSchema,
    })
    .safeParse({
      id: String(formData.get("id") ?? ""),
      status: String(formData.get("status") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { id, status } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

  if (!existing) {
    return { error: "Project not found" };
  }

  if (existing.status === status) {
    return { success: "Status unchanged" };
  }

  const now = new Date();
  await db
    .update(projects)
    .set({
      status,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(projects.id, id));

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "project.status_changed",
    actorId: user.id,
    entityType: "project",
    entityId: id,
    summary: `${actor} moved "${existing.title}" to ${statusLabel(status)}`,
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
  return { success: `Moved to ${statusLabel(status)}` };
}
