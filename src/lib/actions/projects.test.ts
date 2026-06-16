import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { projects } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser } from "@/lib/auth/test-helpers";

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

import { create, setStatus, update } from "@/lib/actions/projects";

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  getDb().run(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      description text,
      status text DEFAULT 'idea' NOT NULL,
      created_by_user_id text NOT NULL,
      updated_by_user_id text NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id),
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    )
  `);
  getDb().run(sql`
    CREATE INDEX IF NOT EXISTS projects_status_updated_at_idx ON projects (status, updated_at DESC)
  `);
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

  it("creates a project and redirects to detail", async () => {
    await expect(
      create({}, formData({ title: "Paint the fence", description: "Need primer" })),
    ).rejects.toThrow(/REDIRECT:\/projects\//);

    const [row] = await getDb().select().from(projects);
    expect(row?.title).toBe("Paint the fence");
    expect(row?.description).toBe("Need primer");
    expect(row?.status).toBe("idea");
    expect(mockEmitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "project.created",
        entityType: "project",
        summary: expect.stringContaining("Paint the fence"),
      }),
    );
    expect(mockEmitMentions).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/projects");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("rejects create without a title", async () => {
    const result = await create({}, formData({ title: "   " }));
    expect(result.error).toMatch(/title/i);
    expect(await getDb().select().from(projects)).toHaveLength(0);
  });

  it("updates project title and description", async () => {
    const user = await createTestUser({ username: "bob" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Old title",
      description: null,
      status: "idea",
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const result = await update(
      {},
      formData({ id, title: "New title", description: "Updated notes" }),
    );

    expect(result.success).toBe("Project updated");
    const [row] = await getDb().select().from(projects).where(eq(projects.id, id));
    expect(row?.title).toBe("New title");
    expect(row?.description).toBe("Updated notes");
    expect(mockEmitMentions).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Updated notes",
        entityType: "project",
        entityId: id,
      }),
    );
  });

  it("returns error when updating a missing project", async () => {
    const result = await update(
      {},
      formData({
        id: crypto.randomUUID(),
        title: "Ghost",
        description: "",
      }),
    );
    expect(result.error).toBe("Project not found");
  });

  it("changes project status and emits notification", async () => {
    const user = await createTestUser({ username: "cara" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Garden beds",
      description: null,
      status: "idea",
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

  it("rejects invalid status values", async () => {
    const user = await createTestUser({ username: "dana" });
    const now = new Date();
    const id = crypto.randomUUID();
    await getDb().insert(projects).values({
      id,
      title: "Shed",
      description: null,
      status: "idea",
      createdByUserId: user.id,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const result = await setStatus({}, formData({ id, status: "archived" }));
    expect(result.error).toBeDefined();
    const [row] = await getDb().select().from(projects).where(eq(projects.id, id));
    expect(row?.status).toBe("idea");
  });
});
