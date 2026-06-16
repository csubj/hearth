import { unauthorizedResponse, validateApiSession } from "@/lib/attachments/auth";
import { getAttachmentById } from "@/lib/attachments/queries";
import { readUploadFile } from "@/lib/attachments/storage";
import { deleteAttachment } from "@/lib/attachments/upload";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await validateApiSession();
  if (!session.user) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const attachment = await getAttachmentById(id);

  if (!attachment) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const data = await readUploadFile(attachment.storagePath);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.sizeBytes),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "File not found." }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await validateApiSession();
  if (!session.user) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const result = await deleteAttachment(id, {
    userId: session.user.id,
    isAdmin: session.user.role === "admin",
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ ok: true });
}
