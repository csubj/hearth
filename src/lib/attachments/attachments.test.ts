import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { attachments, restaurants } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser, loginAs } from "@/lib/auth/test-helpers";
import { GET, DELETE } from "../../../app/api/attachments/[id]/route";
import { POST } from "../../../app/api/attachments/route";
import { detectImageMime } from "./mime";
import { getAttachmentById } from "./queries";
import { resolveUploadPath } from "./storage";
import {
  createAttachmentsTestTable,
  createInvalidBuffer,
  createOversizeBuffer,
  createTempUploadsDir,
  createTestJpegBuffer,
  removeTempUploadsDir,
} from "./test-helpers";
import { deleteAttachment, uploadAttachment } from "./upload";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/notifications/emit", () => ({
  emitHouseholdActivity: vi.fn(),
}));

const { cookies } = await import("next/headers");

function resetTestDb(): void {
  resetDbForTests();
  resetLuciaForTests();
  process.env.DATABASE_URL = ":memory:";
  migrateTestDb();
  createAttachmentsTestTable();
}

async function createRestaurant(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await getDb().insert(restaurants).values({
    id,
    name: "Test Restaurant",
    status: "want_to_try",
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function mockSession(sessionId: string | null): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      sessionId && name === "hearth_session" ? { name, value: sessionId } : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

describe("attachments mime", () => {
  it("detects jpeg from magic bytes", () => {
    const result = detectImageMime(createTestJpegBuffer());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.extension).toBe("jpg");
    }
  });

  it("rejects non-image bytes", () => {
    const result = detectImageMime(createInvalidBuffer());
    expect(result.ok).toBe(false);
  });
});

describe("uploadAttachment", () => {
  let uploadsDir = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    resetTestDb();
    uploadsDir = await createTempUploadsDir();
  });

  afterEach(async () => {
    await removeTempUploadsDir(uploadsDir);
  });

  it("stores a valid jpeg on disk and in the database", async () => {
    const user = await createTestUser();
    const restaurantId = await createRestaurant(user.id);
    const data = createTestJpegBuffer();

    const result = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "meal.jpg",
      data,
      userId: user.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const row = await getAttachmentById(result.attachment.id);
    expect(row).toBeDefined();
    expect(row?.mimeType).toBe("image/jpeg");

    const filePath = resolveUploadPath(row!.storagePath);
    const onDisk = await fs.readFile(filePath);
    expect(onDisk.byteLength).toBe(data.byteLength);
  });

  it("rejects oversize files", async () => {
    const user = await createTestUser();
    const restaurantId = await createRestaurant(user.id);

    const result = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "big.jpg",
      data: createOversizeBuffer(),
      userId: user.id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(413);
  });

  it("rejects invalid mime content", async () => {
    const user = await createTestUser();
    const restaurantId = await createRestaurant(user.id);

    const result = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "bad.jpg",
      data: createInvalidBuffer(),
      userId: user.id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(415);
  });

  it("delete removes row and file from disk", async () => {
    const user = await createTestUser();
    const restaurantId = await createRestaurant(user.id);
    const data = createTestJpegBuffer();

    const upload = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "meal.jpg",
      data,
      userId: user.id,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const row = await getAttachmentById(upload.attachment.id);
    const filePath = resolveUploadPath(row!.storagePath);

    const deleted = await deleteAttachment(upload.attachment.id);
    expect(deleted.ok).toBe(true);

    const afterRow = await getAttachmentById(upload.attachment.id);
    expect(afterRow).toBeUndefined();

    await expect(fs.access(filePath)).rejects.toThrow();
  });
});

describe("attachments API routes", () => {
  let uploadsDir = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    resetTestDb();
    uploadsDir = await createTempUploadsDir();
  });

  afterEach(async () => {
    await removeTempUploadsDir(uploadsDir);
  });

  it("POST /api/attachments uploads for authenticated user", async () => {
    const user = await createTestUser();
    const sessionId = await loginAs(user.id);
    mockSession(sessionId);
    const restaurantId = await createRestaurant(user.id);

    const formData = new FormData();
    formData.set("entityType", "restaurant");
    formData.set("entityId", restaurantId);
    formData.set(
      "file",
      new File([new Uint8Array(createTestJpegBuffer())], "photo.jpg", { type: "image/jpeg" }),
    );

    const response = await POST(
      new Request("http://localhost/api/attachments", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; url: string };
    expect(body.url).toBe(`/api/attachments/${body.id}`);
  });

  it("GET /api/attachments/[id] returns 401 without session", async () => {
    mockSession(null);

    const response = await GET(new Request("http://localhost/api/attachments/x"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(401);
  });

  it("GET /api/attachments/[id] streams file for authenticated user", async () => {
    const user = await createTestUser();
    const sessionId = await loginAs(user.id);
    mockSession(sessionId);
    const restaurantId = await createRestaurant(user.id);

    const upload = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "photo.jpg",
      data: createTestJpegBuffer(),
      userId: user.id,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const response = await GET(new Request("http://localhost/api/attachments/test"), {
      params: Promise.resolve({ id: upload.attachment.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("DELETE /api/attachments/[id] removes attachment", async () => {
    const user = await createTestUser();
    const sessionId = await loginAs(user.id);
    mockSession(sessionId);
    const restaurantId = await createRestaurant(user.id);

    const upload = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "photo.jpg",
      data: createTestJpegBuffer(),
      userId: user.id,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const response = await DELETE(new Request("http://localhost/api/attachments/test"), {
      params: Promise.resolve({ id: upload.attachment.id }),
    });

    expect(response.status).toBe(200);
    const [row] = await getDb()
      .select()
      .from(attachments)
      .where(eq(attachments.id, upload.attachment.id));
    expect(row).toBeUndefined();
  });
});
