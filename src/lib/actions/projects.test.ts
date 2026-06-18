import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { projectComponents, projectItemTags, projectTags, projects } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";
import { deriveProjectTitle } from "@/components/projects/format";

const mockRequireUser = vi.fn();
const mockRevalidatePath = vi.fn();
const mockRedirect = vi.fn();
const mockEmitHouseholdActivity = vi.fn();
const mockEmitMentions = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => mockRequireUser(),
  displayName: (user: { displayName: string | null; username: string }) =>
    user.displayName ?? user.username,
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: (...args: unknown[]) => mockEmitHouseholdActivity(...args),
  emitMentions: (...args: unknown[]) => mockEmitMentions(...args),
}));

import {
  addComponent,
  create,
  getProjectById,
  listProjects,
  setComponentAcquired,
  setPriority,
  setStatus,
  updateComponent,
  updateNotes,
  updateTitle,
} from "@/lib/actions/projects";

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
}

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

describe("project actions", () => {
  beforeEach(async () => {
    resetTestDb();
    vi.clearAllMocks();
    const user = await createTestUser({ username: "alex", displayName: "Alex" });
    mockRequireUser.mockResolvedValue({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        disabledAt: user.disabledAt,
      },
      session: { id: "test-session", userId: user.id, fresh: false, expiresAt: new Date() },
    });
  });

  it("derives title from notes when title omitted", () => {
    expect(deriveProjectTitle(undefined, "Fix the gate\nMore details")).toBe("Fix the gate");
  });

  it("creates a project and redirects to detail", async () => {
    await expect(
      create({}, formData({ title: "Paint the fence", notes: "Need primer" })),
    ).rejects.toThrow(/REDIRECT:\/projects\//);

    const [row] = await getDb().select().from(projects);
    expect(row?.title).toBe("Paint the fence");
    expect(row?.notes).toBe("Need primer");
    expect(row?.status).toBe("idea");
    expect(mockEmitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "project.created",
        entityType: "project",
        summary: expect.stringContaining("Paint the fence"),
      }),
    );
    expect(mockEmitMentions).toHaveBeenCalled();
  });

  it("creates a project from notes-only quick capture", async () => {
    await expect(create({}, formData({ notes: "Replace kitchen faucet" }))).rejects.toThrow(
      /REDIRECT:\/projects\//,
    );

    const [row] = await getDb().select().from(projects);
    expect(row?.title).toBe("Replace kitchen faucet");
    expect(row?.notes).toBe("Replace kitchen faucet");
  });

  it("rejects create without title or notes", async () => {
    const result = await create({}, formData({ title: "   " }));
    expect(result.error).toMatch(/required/i);
    expect(await getDb().select().from(projects)).toHaveLength(0);
  });

  it("updates project title", async () => {
    const user = await createTestUser({ username: "bob" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Old title",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const result = await updateTitle({}, formData({ id, title: "New title" }));

    expect(result.success).toBe("Title updated");
    const [row] = await getDb().select().from(projects).where(eq(projects.id, id));
    expect(row?.title).toBe("New title");
  });

  it("autosaves notes without household activity notification", async () => {
    const user = await createTestUser({ username: "cara" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Garden beds",
      notes: "Old notes",
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const result = await updateNotes(id, "Updated notes");
    expect(result.error).toBeUndefined();

    const [row] = await getDb().select().from(projects).where(eq(projects.id, id));
    expect(row?.notes).toBe("Updated notes");
    expect(mockEmitHouseholdActivity).not.toHaveBeenCalled();
  });

  it("reconciles mentions when requested", async () => {
    const user = await createTestUser({ username: "dana" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Shed",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await updateNotes(id, "hello @alex", { reconcileMentions: true });
    expect(mockEmitMentions).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "hello @alex",
        entityType: "project",
        entityId: id,
      }),
    );
  });

  it("changes project status and emits notification", async () => {
    const user = await createTestUser({ username: "erin" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Garden beds",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const result = await setStatus({}, formData({ id, status: "in_progress" }));

    expect(result.success).toBe("Moved to In progress");
    const [row] = await getDb().select().from(projects).where(eq(projects.id, id));
    expect(row?.status).toBe("in_progress");
    expect(mockEmitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "project.status_changed",
        summary: expect.stringContaining("In progress"),
      }),
    );
  });

  it("sorts by priority with nulls last", async () => {
    const user = await createTestUser({ username: "frank" });
    const now = new Date();
    const highId = crypto.randomUUID();
    const lowId = crypto.randomUUID();
    const unsetId = crypto.randomUUID();

    await getDb()
      .insert(projects)
      .values([
        {
          id: highId,
          title: "High",
          notes: null,
          status: "idea",
          priority: 5,
          targetWhen: null,
          budgetCents: null,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: new Date(now.getTime() + 1000),
        },
        {
          id: lowId,
          title: "Low",
          notes: null,
          status: "idea",
          priority: 1,
          targetWhen: null,
          budgetCents: null,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: unsetId,
          title: "Unset",
          notes: null,
          status: "idea",
          priority: null,
          targetWhen: null,
          budgetCents: null,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: new Date(now.getTime() + 2000),
        },
      ]);

    const items = await listProjects({ sort: "priority_desc" });
    expect(items.map((item) => item.id)).toEqual([highId, lowId, unsetId]);
  });

  it("rolls up component costs on list", async () => {
    const user = await createTestUser({ username: "gina" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Deck",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(projectComponents).values({
      id: crypto.randomUUID(),
      projectId: id,
      name: "Lumber",
      kind: "item",
      quantity: 2,
      unitCostCents: 1500,
      acquired: false,
      acquiredAt: null,
      purchaseUrl: null,
      sortOrder: 0,
      note: null,
      createdAt: now,
      updatedAt: now,
    });

    const items = await listProjects({});
    expect(items[0]?.estimatedCostCents).toBe(3000);
  });

  it("filters projects by tag", async () => {
    const user = await createTestUser({ username: "hal" });
    const now = new Date();
    const taggedId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    const tagId = crypto.randomUUID();

    await getDb()
      .insert(projects)
      .values([
        {
          id: taggedId,
          title: "Garage",
          notes: null,
          status: "idea",
          priority: null,
          targetWhen: null,
          budgetCents: null,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: otherId,
          title: "Kitchen",
          notes: null,
          status: "idea",
          priority: null,
          targetWhen: null,
          budgetCents: null,
          createdByUserId: user.id,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    await getDb().insert(projectTags).values({ id: tagId, name: "garage", createdAt: now });
    await getDb().insert(projectItemTags).values({ projectId: taggedId, tagId });

    const items = await listProjects({ tag: "garage" });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(taggedId);
  });

  it("sets priority", async () => {
    const user = await createTestUser({ username: "ivy" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Roof",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const result = await setPriority({}, formData({ id, priority: "4" }));
    expect(result.success).toBe("Priority updated");
    const [row] = await getDb().select().from(projects).where(eq(projects.id, id));
    expect(row?.priority).toBe(4);
  });

  it("adds a component with kind and metadata defaults", async () => {
    const user = await createTestUser({ username: "jane" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Fence",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const result = await addComponent(
      {},
      formData({
        projectId: id,
        name: "Gate latch",
        kind: "item",
        quantity: "2",
        unitCostCents: "1200",
        purchaseUrl: "https://example.com/latch",
        note: "Pick up at hardware store",
      }),
    );

    expect(result.success).toBe("Component added");
    const [component] = await getDb()
      .select()
      .from(projectComponents)
      .where(eq(projectComponents.projectId, id));
    expect(component?.kind).toBe("item");
    expect(component?.purchaseUrl).toBe("https://example.com/latch");
    expect(component?.note).toBe("Pick up at hardware store");
    expect(component?.acquired).toBe(false);
  });

  it("updates component metadata", async () => {
    const user = await createTestUser({ username: "kate" });
    const now = new Date();
    const projectId = crypto.randomUUID();
    const componentId = crypto.randomUUID();
    await getDb().insert(projects).values({
      id: projectId,
      title: "Patio",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb().insert(projectComponents).values({
      id: componentId,
      projectId,
      name: "Pavers",
      kind: "item",
      quantity: 1,
      unitCostCents: 5000,
      acquired: false,
      acquiredAt: null,
      purchaseUrl: null,
      sortOrder: 0,
      note: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await updateComponent(
      {},
      formData({
        componentId,
        projectId,
        name: "Concrete pavers",
        kind: "item",
        quantity: "10",
        unitCostCents: "500",
        purchaseUrl: "https://example.com/pavers",
        note: "Delivery only",
      }),
    );

    expect(result.success).toBe("Component updated");
    const [component] = await getDb()
      .select()
      .from(projectComponents)
      .where(eq(projectComponents.id, componentId));
    expect(component?.name).toBe("Concrete pavers");
    expect(component?.quantity).toBe(10);
    expect(component?.purchaseUrl).toBe("https://example.com/pavers");
    expect(component?.note).toBe("Delivery only");
  });

  it("toggles component acquired state and rollups", async () => {
    const user = await createTestUser({ username: "leo" });
    const now = new Date();
    const projectId = crypto.randomUUID();
    const acquiredId = crypto.randomUUID();
    const neededId = crypto.randomUUID();
    await getDb().insert(projects).values({
      id: projectId,
      title: "Shed",
      notes: null,
      status: "idea",
      priority: null,
      targetWhen: null,
      budgetCents: null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
    await getDb()
      .insert(projectComponents)
      .values([
        {
          id: acquiredId,
          projectId,
          name: "Paint",
          kind: "item",
          quantity: 1,
          unitCostCents: 2000,
          acquired: false,
          acquiredAt: null,
          purchaseUrl: null,
          sortOrder: 0,
          note: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: neededId,
          projectId,
          name: "Labor",
          kind: "labor",
          quantity: 1,
          unitCostCents: 5000,
          acquired: false,
          acquiredAt: null,
          purchaseUrl: null,
          sortOrder: 1,
          note: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

    const markResult = await setComponentAcquired(
      {},
      formData({ componentId: acquiredId, projectId, acquired: "true" }),
    );
    expect(markResult.success).toBe("Marked acquired");

    const project = await getProjectById(projectId);
    expect(project?.estimatedCostCents).toBe(7000);
    expect(project?.acquiredCostCents).toBe(2000);
    expect(project?.remainingCostCents).toBe(5000);
    expect(project?.acquiredCount).toBe(1);
    expect(project?.componentCount).toBe(2);

    const [acquiredRow] = await getDb()
      .select()
      .from(projectComponents)
      .where(eq(projectComponents.id, acquiredId));
    expect(acquiredRow?.acquired).toBe(true);
    expect(acquiredRow?.acquiredAt).toBeTruthy();

    const unmarkResult = await setComponentAcquired(
      {},
      formData({ componentId: acquiredId, projectId, acquired: "false" }),
    );
    expect(unmarkResult.success).toBe("Marked needed");
    const [unmarkedRow] = await getDb()
      .select()
      .from(projectComponents)
      .where(eq(projectComponents.id, acquiredId));
    expect(unmarkedRow?.acquired).toBe(false);
    expect(unmarkedRow?.acquiredAt).toBeNull();
  });
});
