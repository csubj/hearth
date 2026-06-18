"use server";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import {
  PROJECT_COMPONENT_KINDS,
  PROJECT_STATUSES,
  projectComponents,
  projectItemTags,
  projectLinks,
  projectTags,
  projects,
  type Project,
  type ProjectComponent,
  type ProjectLink,
  type ProjectStatus,
  type ProjectTag,
} from "@/db/schema";
import { displayName, requireUser } from "@/lib/auth/session";
import { deriveProjectTitle } from "@/components/projects/format";
import { componentRollups, countAcquired, sumComponentCosts } from "@/lib/projects/rollups";
import { emitHouseholdActivity, emitMentions } from "@/lib/notifications/emit";

export type ProjectActionState = {
  error?: string;
  success?: string;
};

export type ProjectListItem = Project & {
  tags: ProjectTag[];
  estimatedCostCents: number;
  acquiredCount: number;
  componentCount: number;
};

export type ProjectDetail = Project & {
  tags: ProjectTag[];
  links: ProjectLink[];
  components: ProjectComponent[];
  estimatedCostCents: number;
  acquiredCostCents: number;
  remainingCostCents: number;
  acquiredCount: number;
  componentCount: number;
};

export type ProjectListFilters = {
  q?: string;
  tag?: string;
  sort?: "updated_desc" | "priority_desc" | "cost_desc";
};

const titleSchema = z.string().trim().min(1, "Title is required").max(200);
const optionalTitleSchema = z.string().trim().max(200).optional();
const notesSchema = z.string().trim().max(10_000).optional();
const statusSchema = z.enum(PROJECT_STATUSES);
const prioritySchema = z.number().int().min(1).max(5).nullable();
const urlSchema = z.string().trim().url("Valid URL is required").max(2000);
const componentKindSchema = z.enum(PROJECT_COMPONENT_KINDS);

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

function searchPattern(query: string): string {
  return `%${query.toLowerCase()}%`;
}

async function loadTagsForProjects(projectIds: string[]): Promise<Map<string, ProjectTag[]>> {
  const result = new Map<string, ProjectTag[]>();
  if (projectIds.length === 0) {
    return result;
  }

  const rows = await getDb()
    .select({
      projectId: projectItemTags.projectId,
      tag: projectTags,
    })
    .from(projectItemTags)
    .innerJoin(projectTags, eq(projectItemTags.tagId, projectTags.id))
    .where(inArray(projectItemTags.projectId, projectIds));

  for (const row of rows) {
    const current = result.get(row.projectId) ?? [];
    current.push(row.tag);
    result.set(row.projectId, current);
  }

  return result;
}

async function loadComponentsForProjects(
  projectIds: string[],
): Promise<Map<string, ProjectComponent[]>> {
  const result = new Map<string, ProjectComponent[]>();
  if (projectIds.length === 0) {
    return result;
  }

  const rows = await getDb()
    .select()
    .from(projectComponents)
    .where(inArray(projectComponents.projectId, projectIds))
    .orderBy(projectComponents.sortOrder, projectComponents.createdAt);

  for (const row of rows) {
    const current = result.get(row.projectId) ?? [];
    current.push(row);
    result.set(row.projectId, current);
  }

  return result;
}

async function resolveTagIdByName(name: string): Promise<string | null> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const [existing] = await getDb()
    .select()
    .from(projectTags)
    .where(sql`lower(${projectTags.name}) = ${normalized}`)
    .limit(1);

  return existing?.id ?? null;
}

async function getOrCreateTagId(name: string, now: Date): Promise<string> {
  const trimmed = name.trim();
  const normalized = trimmed.toLowerCase();

  const [existing] = await getDb()
    .select()
    .from(projectTags)
    .where(sql`lower(${projectTags.name}) = ${normalized}`)
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  await getDb().insert(projectTags).values({ id, name: trimmed, createdAt: now });
  return id;
}

async function replaceProjectTags(projectId: string, tagNames: string[]): Promise<void> {
  const db = getDb();
  const now = new Date();
  const uniqueNames = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
  const tagIds: string[] = [];

  for (const name of uniqueNames) {
    tagIds.push(await getOrCreateTagId(name, now));
  }

  await db.delete(projectItemTags).where(eq(projectItemTags.projectId, projectId));

  if (tagIds.length > 0) {
    await db.insert(projectItemTags).values(
      tagIds.map((tagId) => ({
        projectId,
        tagId,
      })),
    );
  }
}

function parseListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ProjectListFilters {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : undefined;
  const tag = typeof searchParams.tag === "string" ? searchParams.tag.trim() : undefined;
  const sortRaw = typeof searchParams.sort === "string" ? searchParams.sort.trim() : undefined;
  const sort =
    sortRaw === "priority_desc" || sortRaw === "cost_desc" || sortRaw === "updated_desc"
      ? sortRaw
      : "updated_desc";

  return {
    q: q || undefined,
    tag: tag || undefined,
    sort,
  };
}

function sortProjects(
  items: ProjectListItem[],
  sort: ProjectListFilters["sort"],
): ProjectListItem[] {
  const copy = [...items];
  switch (sort) {
    case "priority_desc":
      return copy.sort((a, b) => {
        const aPriority = a.priority ?? -1;
        const bPriority = b.priority ?? -1;
        if (bPriority !== aPriority) {
          return bPriority - aPriority;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    case "cost_desc":
      return copy.sort((a, b) => {
        if (b.estimatedCostCents !== a.estimatedCostCents) {
          return b.estimatedCostCents - a.estimatedCostCents;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    case "updated_desc":
    default:
      return copy.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}

export async function listProjectTags(): Promise<ProjectTag[]> {
  await requireUser();
  return getDb().select().from(projectTags).orderBy(projectTags.name);
}

export async function listProjects(
  searchParams: Record<string, string | string[] | undefined> = {},
): Promise<ProjectListItem[]> {
  await requireUser();
  const { q, tag, sort = "updated_desc" } = parseListFilters(searchParams);
  const db = getDb();

  const conditions = [];

  if (q) {
    const pattern = searchPattern(q);
    conditions.push(
      or(
        sql`lower(${projects.title}) like ${pattern}`,
        sql`lower(coalesce(${projects.notes}, '')) like ${pattern}`,
        sql`lower(coalesce(${projects.targetWhen}, '')) like ${pattern}`,
      ),
    );
  }

  if (tag) {
    const tagId = await resolveTagIdByName(tag);
    if (!tagId) {
      return [];
    }
    const tagged = await db
      .select({ projectId: projectItemTags.projectId })
      .from(projectItemTags)
      .where(eq(projectItemTags.tagId, tagId));
    const projectIdsFromTag = tagged.map((row) => row.projectId);
    if (projectIdsFromTag.length === 0) {
      return [];
    }
    conditions.push(inArray(projects.id, projectIdsFromTag));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(projects).where(whereClause);

  const projectIds = rows.map((row) => row.id);
  const [tagsByProject, componentsByProject] = await Promise.all([
    loadTagsForProjects(projectIds),
    loadComponentsForProjects(projectIds),
  ]);

  let items: ProjectListItem[] = rows.map((row) => {
    const components = componentsByProject.get(row.id) ?? [];
    const { acquiredCount, componentCount } = countAcquired(components);
    return {
      ...row,
      tags: tagsByProject.get(row.id) ?? [],
      estimatedCostCents: sumComponentCosts(components),
      acquiredCount,
      componentCount,
    };
  });

  if (q) {
    const pattern = q.toLowerCase();
    items = items.filter((item) => {
      if (
        item.title.toLowerCase().includes(pattern) ||
        (item.notes?.toLowerCase().includes(pattern) ?? false) ||
        (item.targetWhen?.toLowerCase().includes(pattern) ?? false)
      ) {
        return true;
      }
      const components = componentsByProject.get(item.id) ?? [];
      if (components.some((component) => component.name.toLowerCase().includes(pattern))) {
        return true;
      }
      return item.tags.some((tagItem) => tagItem.name.toLowerCase().includes(pattern));
    });
  }

  return sortProjects(items, sort);
}

export async function getProjectById(id: string): Promise<ProjectDetail | null> {
  await requireUser();
  const db = getDb();

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return null;
  }

  const [tags, links, components] = await Promise.all([
    db
      .select({ tag: projectTags })
      .from(projectItemTags)
      .innerJoin(projectTags, eq(projectItemTags.tagId, projectTags.id))
      .where(eq(projectItemTags.projectId, id))
      .then((rows) => rows.map((row) => row.tag)),
    db
      .select()
      .from(projectLinks)
      .where(eq(projectLinks.projectId, id))
      .orderBy(projectLinks.createdAt),
    db
      .select()
      .from(projectComponents)
      .where(eq(projectComponents.projectId, id))
      .orderBy(projectComponents.sortOrder, projectComponents.createdAt),
  ]);

  return {
    ...project,
    tags,
    links,
    components,
    ...componentRollups(components),
  };
}

export async function getProjectsHomeSummary(limit = 5): Promise<ProjectListItem[]> {
  const items = await listProjects({});
  const filtered = items
    .filter((item) => item.status !== "done")
    .sort((a, b) => {
      const aPriority = a.priority ?? -1;
      const bPriority = b.priority ?? -1;
      if (bPriority !== aPriority) {
        return bPriority - aPriority;
      }
      if (a.status === "in_progress" && b.status !== "in_progress") {
        return -1;
      }
      if (b.status === "in_progress" && a.status !== "in_progress") {
        return 1;
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  return filtered.slice(0, limit);
}

export async function getProjectsHomeStats(): Promise<{ active: number }> {
  await requireUser();
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(sql`${projects.status} != 'done'`);
  return { active: row?.count ?? 0 };
}

export async function create(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      title: optionalTitleSchema,
      notes: notesSchema,
      status: statusSchema.optional(),
      redirect: z.enum(["detail", "none"]).optional(),
    })
    .safeParse({
      title: String(formData.get("title") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "") || undefined,
      status: String(formData.get("status") ?? "idea") || undefined,
      redirect: String(formData.get("redirect") ?? "detail") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { notes, status = "idea", redirect: redirectMode = "detail" } = parsed.data;
  const trimmedNotes = notes?.trim();
  const trimmedTitle = parsed.data.title?.trim();

  if (!trimmedTitle && !trimmedNotes) {
    return { error: "Title or notes are required" };
  }

  const title = deriveProjectTitle(trimmedTitle || undefined, trimmedNotes || undefined);

  const now = new Date();
  const id = crypto.randomUUID();

  await getDb()
    .insert(projects)
    .values({
      id,
      title,
      notes: trimmedNotes ?? null,
      status,
      priority: null,
      targetWhen: null,
      budgetCents: null,
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

  if (trimmedNotes) {
    await emitMentions({
      body: trimmedNotes,
      entityType: "project",
      entityId: id,
      actorId: user.id,
    });
  }

  revalidatePath("/projects");
  revalidatePath("/");

  if (redirectMode === "none") {
    return { success: "Project created" };
  }

  redirect(`/projects/${id}`);
}

export async function updateTitle(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      id: z.string().uuid(),
      title: titleSchema,
    })
    .safeParse({
      id: String(formData.get("id") ?? ""),
      title: String(formData.get("title") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { id, title } = parsed.data;
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
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(projects.id, id));

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
  return { success: "Title updated" };
}

export async function updateNotes(
  projectId: string,
  notes: string,
  options?: { reconcileMentions?: boolean },
): Promise<{ error?: string }> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      projectId: z.string().uuid(),
      notes: z.string().max(10_000),
    })
    .safeParse({ projectId, notes });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!existing) {
    return { error: "Project not found" };
  }

  const now = new Date();
  await db
    .update(projects)
    .set({
      notes: notes.trim() ? notes : null,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(projects.id, projectId));

  if (options?.reconcileMentions) {
    await emitMentions({
      body: notes,
      entityType: "project",
      entityId: projectId,
      actorId: user.id,
    });
  }

  return {};
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

export async function setPriority(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      id: z.string().uuid(),
      priority: prioritySchema,
    })
    .safeParse({
      id: String(formData.get("id") ?? ""),
      priority: (() => {
        const raw = String(formData.get("priority") ?? "");
        if (raw === "" || raw === "unset") {
          return null;
        }
        return Number(raw);
      })(),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { id, priority } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

  if (!existing) {
    return { error: "Project not found" };
  }

  const now = new Date();
  await db
    .update(projects)
    .set({
      priority,
      updatedByUserId: user.id,
      updatedAt: now,
    })
    .where(eq(projects.id, id));

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/");
  return { success: "Priority updated" };
}

export async function setTags(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      projectId: z.string().uuid(),
      tags: z.string().optional(),
    })
    .safeParse({
      projectId: String(formData.get("projectId") ?? ""),
      tags: String(formData.get("tags") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { projectId, tags: tagsRaw } = parsed.data;
  const project = await getProjectById(projectId);
  if (!project) {
    return { error: "Project not found" };
  }

  const tagNames = (tagsRaw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  await replaceProjectTags(projectId, tagNames);

  const now = new Date();
  await getDb()
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return { success: "Tags updated" };
}

export async function addLink(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      projectId: z.string().uuid(),
      label: z.string().trim().min(1, "Label is required").max(100),
      url: urlSchema,
    })
    .safeParse({
      projectId: String(formData.get("projectId") ?? ""),
      label: String(formData.get("label") ?? ""),
      url: String(formData.get("url") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { projectId, label, url } = parsed.data;
  const project = await getProjectById(projectId);
  if (!project) {
    return { error: "Project not found" };
  }

  const now = new Date();
  await getDb().insert(projectLinks).values({
    id: crypto.randomUUID(),
    projectId,
    label,
    url,
    createdAt: now,
  });

  await getDb()
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { success: "Link added" };
}

export async function removeLink(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      linkId: z.string().uuid(),
      projectId: z.string().uuid(),
    })
    .safeParse({
      linkId: String(formData.get("linkId") ?? ""),
      projectId: String(formData.get("projectId") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { linkId, projectId } = parsed.data;
  const project = await getProjectById(projectId);
  if (!project) {
    return { error: "Project not found" };
  }

  await getDb()
    .delete(projectLinks)
    .where(and(eq(projectLinks.id, linkId), eq(projectLinks.projectId, projectId)));

  const now = new Date();
  await getDb()
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { success: "Link removed" };
}

export async function addComponent(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      projectId: z.string().uuid(),
      name: z.string().trim().min(1, "Name is required").max(200),
      kind: componentKindSchema.optional(),
      quantity: z.coerce.number().int().min(1).max(9999).optional(),
      unitCostCents: z.coerce.number().int().min(0).optional(),
      purchaseUrl: z.string().trim().url("Valid URL is required").max(2000).optional(),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({
      projectId: String(formData.get("projectId") ?? ""),
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("kind") ?? "") || undefined,
      quantity: String(formData.get("quantity") ?? "") || undefined,
      unitCostCents: String(formData.get("unitCostCents") ?? "") || undefined,
      purchaseUrl: String(formData.get("purchaseUrl") ?? "") || undefined,
      note: String(formData.get("note") ?? "") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const {
    projectId,
    name,
    kind = "item",
    quantity = 1,
    unitCostCents = 0,
    purchaseUrl,
    note,
  } = parsed.data;
  const project = await getProjectById(projectId);
  if (!project) {
    return { error: "Project not found" };
  }

  const now = new Date();
  const maxSort =
    project.components.length > 0
      ? Math.max(...project.components.map((component) => component.sortOrder))
      : -1;

  await getDb()
    .insert(projectComponents)
    .values({
      id: crypto.randomUUID(),
      projectId,
      name,
      kind,
      quantity,
      unitCostCents,
      acquired: false,
      acquiredAt: null,
      purchaseUrl: purchaseUrl ?? null,
      sortOrder: maxSort + 1,
      note: note ?? null,
      createdAt: now,
      updatedAt: now,
    });

  await getDb()
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { success: "Component added" };
}

export async function updateComponent(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      componentId: z.string().uuid(),
      projectId: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      kind: componentKindSchema,
      quantity: z.coerce.number().int().min(1).max(9999),
      unitCostCents: z.coerce.number().int().min(0),
      purchaseUrl: z.string().trim().max(2000).optional(),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse({
      componentId: String(formData.get("componentId") ?? ""),
      projectId: String(formData.get("projectId") ?? ""),
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("kind") ?? "item"),
      quantity: String(formData.get("quantity") ?? ""),
      unitCostCents: String(formData.get("unitCostCents") ?? ""),
      purchaseUrl: String(formData.get("purchaseUrl") ?? "") || undefined,
      note: String(formData.get("note") ?? "") || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { componentId, projectId, name, kind, quantity, unitCostCents, purchaseUrl, note } =
    parsed.data;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(projectComponents)
    .where(and(eq(projectComponents.id, componentId), eq(projectComponents.projectId, projectId)))
    .limit(1);

  if (!existing) {
    return { error: "Component not found" };
  }

  const purchaseUrlValue =
    purchaseUrl === undefined
      ? existing.purchaseUrl
      : purchaseUrl.trim()
        ? urlSchema.parse(purchaseUrl)
        : null;

  const now = new Date();
  await db
    .update(projectComponents)
    .set({
      name,
      kind,
      quantity,
      unitCostCents,
      purchaseUrl: purchaseUrlValue,
      note: note ?? null,
      updatedAt: now,
    })
    .where(eq(projectComponents.id, componentId));

  await db
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { success: "Component updated" };
}

export async function setComponentAcquired(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      componentId: z.string().uuid(),
      projectId: z.string().uuid(),
      acquired: z.enum(["true", "false"]).transform((value) => value === "true"),
    })
    .safeParse({
      componentId: String(formData.get("componentId") ?? ""),
      projectId: String(formData.get("projectId") ?? ""),
      acquired: String(formData.get("acquired") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { componentId, projectId, acquired } = parsed.data;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(projectComponents)
    .where(and(eq(projectComponents.id, componentId), eq(projectComponents.projectId, projectId)))
    .limit(1);

  if (!existing) {
    return { error: "Component not found" };
  }

  const now = new Date();
  await db
    .update(projectComponents)
    .set({
      acquired,
      acquiredAt: acquired ? now : null,
      updatedAt: now,
    })
    .where(eq(projectComponents.id, componentId));

  await db
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { success: acquired ? "Marked acquired" : "Marked needed" };
}

export async function removeComponent(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      componentId: z.string().uuid(),
      projectId: z.string().uuid(),
    })
    .safeParse({
      componentId: String(formData.get("componentId") ?? ""),
      projectId: String(formData.get("projectId") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { componentId, projectId } = parsed.data;
  await getDb()
    .delete(projectComponents)
    .where(and(eq(projectComponents.id, componentId), eq(projectComponents.projectId, projectId)));

  const now = new Date();
  await getDb()
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { success: "Component removed" };
}

export async function reorderComponent(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      componentId: z.string().uuid(),
      projectId: z.string().uuid(),
      direction: z.enum(["up", "down"]),
    })
    .safeParse({
      componentId: String(formData.get("componentId") ?? ""),
      projectId: String(formData.get("projectId") ?? ""),
      direction: String(formData.get("direction") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { componentId, projectId, direction } = parsed.data;
  const project = await getProjectById(projectId);
  if (!project) {
    return { error: "Project not found" };
  }

  const index = project.components.findIndex((component) => component.id === componentId);
  if (index === -1) {
    return { error: "Component not found" };
  }

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= project.components.length) {
    return { success: "Order unchanged" };
  }

  const current = project.components[index]!;
  const swap = project.components[swapIndex]!;
  const db = getDb();
  const now = new Date();

  await db
    .update(projectComponents)
    .set({ sortOrder: swap.sortOrder, updatedAt: now })
    .where(eq(projectComponents.id, current.id));
  await db
    .update(projectComponents)
    .set({ sortOrder: current.sortOrder, updatedAt: now })
    .where(eq(projectComponents.id, swap.id));

  await db
    .update(projects)
    .set({ updatedByUserId: user.id, updatedAt: now })
    .where(eq(projects.id, projectId));

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { success: "Order updated" };
}

export async function deleteProject(
  _prev: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const { user } = await requireUser();

  const parsed = z
    .object({
      id: z.string().uuid(),
    })
    .safeParse({
      id: String(formData.get("id") ?? ""),
    });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const { id } = parsed.data;
  const db = getDb();
  const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

  if (!existing) {
    return { error: "Project not found" };
  }

  await db.delete(projects).where(eq(projects.id, id));

  const actor = displayName(user);
  await emitHouseholdActivity({
    type: "project.deleted",
    actorId: user.id,
    entityType: "project",
    entityId: id,
    summary: `${actor} deleted "${existing.title}"`,
  });

  revalidatePath("/projects");
  revalidatePath("/");
  redirect("/projects");
}
