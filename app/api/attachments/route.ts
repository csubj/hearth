import { unauthorizedResponse, validateApiSession } from "@/lib/attachments/auth";
import { isAttachmentEntityType } from "@/lib/attachments/entity";
import { uploadAttachment } from "@/lib/attachments/upload";

export async function POST(request: Request): Promise<Response> {
  const session = await validateApiSession();
  if (!session.user) {
    return unauthorizedResponse();
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
