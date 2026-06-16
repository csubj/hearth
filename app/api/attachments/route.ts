import { unauthorizedResponse, validateApiSession } from "@/lib/attachments/auth";
import { getMaxBytesForEntity, MAX_ATTACHMENT_BYTES_DOCUMENT } from "@/lib/attachments/config";
import { isAttachmentEntityType } from "@/lib/attachments/entity";
import { uploadAttachment } from "@/lib/attachments/upload";

export const runtime = "nodejs";

function rejectOversizeRequest(request: Request): Response | null {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) {
    return null;
  }

  const size = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(size) || size <= MAX_ATTACHMENT_BYTES_DOCUMENT) {
    return null;
  }

  return Response.json({ error: "File exceeds the 25 MB limit." }, { status: 413 });
}

export async function POST(request: Request): Promise<Response> {
  const session = await validateApiSession();
  if (!session.user) {
    return unauthorizedResponse();
  }

  const oversizeResponse = rejectOversizeRequest(request);
  if (oversizeResponse) {
    return oversizeResponse;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  const entityType = formData.get("entityType");
  const entityId = formData.get("entityId");

  if (!(file instanceof File)) {
    return Response.json({ error: "File is required." }, { status: 400 });
  }

  if (typeof entityType !== "string" || !isAttachmentEntityType(entityType)) {
    return Response.json({ error: "Invalid entity type." }, { status: 400 });
  }

  if (typeof entityId !== "string" || entityId.length === 0) {
    return Response.json({ error: "Entity id is required." }, { status: 400 });
  }

  const maxBytes = getMaxBytesForEntity(entityType);
  if (file.size > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return Response.json({ error: `File exceeds the ${limitMb} MB limit.` }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadAttachment({
    entityType,
    entityId,
    filename: file.name,
    data: buffer,
    userId: session.user.id,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    id: result.attachment.id,
    url: result.attachment.url,
  });
}
