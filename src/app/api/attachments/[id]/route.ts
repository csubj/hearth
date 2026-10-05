/**
 * Streamed attachment serving (design D15, task 8.4).
 *
 * `GET /api/attachments/{id}[?size=thumb]` — authenticated by a session cookie
 * OR a bearer key. Responds with Content-Length, immutable caching, nosniff,
 * and the sniffed type. Unauthenticated requests get 401 with no bytes.
 */

import { getContext } from "@/server/context";
import { readAttachment } from "@/server/attachments";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const size = url.searchParams.get("size") === "thumb" ? "thumb" : "full";

  const ctx = await getContext(request);
  if (!ctx.user) {
    return new Response(
      JSON.stringify({
        error: { code: "unauthorized", message: "Sign in to view attachments.", requestId: ctx.requestId },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let file: { bytes: Buffer; mime: string; filename: string };
  try {
    file = readAttachment(id, size);
  } catch {
    return new Response(
      JSON.stringify({
        error: { code: "not_found", message: "Attachment not found.", requestId: ctx.requestId },
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
    },
  });
}
