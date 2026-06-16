import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { migrateTestDb } from "@/db/test-setup";
import { attachments, restaurants } from "@/db/schema";
import { resetLuciaForTests } from "@/lib/auth/lucia";
import { createTestUser, loginAs } from "@/lib/auth/test-helpers";
import { emitHouseholdActivity } from "@/lib/notifications/emit";
import { GET, DELETE } from "../../../app/api/attachments/[id]/route";
import { POST } from "../../../app/api/attachments/route";
import { MAX_ATTACHMENT_BYTES_DOCUMENT } from "./config";
import { detectImageMime, filenameExtensionMatchesDetected } from "./mime";
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

  it("rejects extension and mime mismatch", () => {
    expect(filenameExtensionMatchesDetected("photo.png", "jpg")).toBe(false);
    expect(filenameExtensionMatchesDetected("photo.jpg", "jpg")).toBe(true);
    expect(filenameExtensionMatchesDetected("photo.jpeg", "jpg")).toBe(true);
  });
});

describe("resolveUploadPath", () => {
  it("rejects path traversal attempts", () => {
    expect(() => resolveUploadPath("../../etc/passwd")).toThrow("Invalid storage path.");
    expect(() => resolveUploadPath("../secrets/file.jpg")).toThrow("Invalid storage path.");
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
    expect(row?.storagePath.endsWith(".jpg")).toBe(true);

    const filePath = resolveUploadPath(row!.storagePath);
    const onDisk = await fs.readFile(filePath);
    expect(onDisk.byteLength).toBe(data.byteLength);

    expect(emitHouseholdActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "restaurant.updated",
        summary: expect.stringMatching(/added a photo$/),
      }),
    );
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

  it("rejects filename extension that does not match content", async () => {
    const user = await createTestUser();
    const restaurantId = await createRestaurant(user.id);

    const result = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "meal.png",
      data: createTestJpegBuffer(),
      userId: user.id,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.status).toBe(415);
    expect(result.error).toContain("extension");
  });

  it("rejects the 11th upload for an entity", async () => {
    const user = await createTestUser();
    const restaurantId = await createRestaurant(user.id);
    const data = createTestJpegBuffer();

    for (let index = 0; index < 10; index += 1) {
      const result = await uploadAttachment({
        entityType: "restaurant",
        entityId: restaurantId,
        filename: `photo-${index}.jpg`,
        data,
        userId: user.id,
      });
      expect(result.ok).toBe(true);
    }

    const eleventh = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "photo-11.jpg",
      data,
      userId: user.id,
    });

    expect(eleventh.ok).toBe(false);
    if (eleventh.ok) {
      return;
    }
    expect(eleventh.status).toBe(409);
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

    const deleted = await deleteAttachment(upload.attachment.id, {
      userId: user.id,
      isAdmin: false,
    });
    expect(deleted.ok).toBe(true);

    const afterRow = await getAttachmentById(upload.attachment.id);
    expect(afterRow).toBeUndefined();

    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it("delete blocks non-owner non-admin", async () => {
    const owner = await createTestUser({ username: "owner" });
    const other = await createTestUser({ username: "other" });
    const restaurantId = await createRestaurant(owner.id);

    const upload = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "meal.jpg",
      data: createTestJpegBuffer(),
      userId: owner.id,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const deleted = await deleteAttachment(upload.attachment.id, {
      userId: other.id,
      isAdmin: false,
    });

    expect(deleted.ok).toBe(false);
    if (deleted.ok) {
      return;
    }
    expect(deleted.status).toBe(403);
    expect(await getAttachmentById(upload.attachment.id)).toBeDefined();
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

  it("POST /api/attachments returns 401 without session", async () => {
    mockSession(null);

    const formData = new FormData();
    formData.set("entityType", "restaurant");
    formData.set("entityId", crypto.randomUUID());
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

    expect(response.status).toBe(401);
  });

  it("POST /api/attachments rejects oversize Content-Length before buffering", async () => {
    const user = await createTestUser();
    const sessionId = await loginAs(user.id);
    mockSession(sessionId);

    const response = await POST(
      new Request("http://localhost/api/attachments", {
        method: "POST",
        headers: {
          "Content-Length": String(MAX_ATTACHMENT_BYTES_DOCUMENT + 1),
        },
        body: new Uint8Array([1, 2, 3]),
      }),
    );

    expect(response.status).toBe(413);
  });

  it("POST /api/attachments rejects oversize file before buffering body", async () => {
    const user = await createTestUser();
    const sessionId = await loginAs(user.id);
    mockSession(sessionId);
    const restaurantId = await createRestaurant(user.id);

    const formData = new FormData();
    formData.set("entityType", "restaurant");
    formData.set("entityId", restaurantId);
    formData.set(
      "file",
      new File([new Uint8Array(createOversizeBuffer())], "big.jpg", { type: "image/jpeg" }),
    );

    const response = await POST(
      new Request("http://localhost/api/attachments", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(413);
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

  it("DELETE /api/attachments/[id] returns 401 without session", async () => {
    mockSession(null);

    const response = await DELETE(new Request("http://localhost/api/attachments/test"), {
      params: Promise.resolve({ id: crypto.randomUUID() }),
    });

    expect(response.status).toBe(401);
  });

  it("DELETE /api/attachments/[id] removes attachment for owner", async () => {
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

  it("DELETE /api/attachments/[id] blocks non-owner", async () => {
    const owner = await createTestUser({ username: "owner_api" });
    const other = await createTestUser({ username: "other_api" });
    const sessionId = await loginAs(other.id);
    mockSession(sessionId);
    const restaurantId = await createRestaurant(owner.id);

    const upload = await uploadAttachment({
      entityType: "restaurant",
      entityId: restaurantId,
      filename: "photo.jpg",
      data: createTestJpegBuffer(),
      userId: owner.id,
    });

    expect(upload.ok).toBe(true);
    if (!upload.ok) {
      return;
    }

    const response = await DELETE(new Request("http://localhost/api/attachments/test"), {
      params: Promise.resolve({ id: upload.attachment.id }),
    });

    expect(response.status).toBe(403);
    expect(await getAttachmentById(upload.attachment.id)).toBeDefined();
  });
});
