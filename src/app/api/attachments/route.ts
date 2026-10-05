/**
 * Web session attachment upload (design D15, task 8.4).
 *
 * `POST /api/attachments` for the browser, authenticated by the session cookie
 * (not a bearer key) and guarded by a same-origin check. It reuses the same
 * `uploadAttachment` implementation as the REST route.
 */

import { getContext } from "@/server/context";
import { uploadAttachment, PDF_MAX_BYTES } from "@/server/attachments";
import { encodeErrorBody } from "@/server/orpc";
import { ORPCError } from "@orpc/server";

const MULTIPART_SLACK = 256 * 1024;
const MAX_CONTENT_LENGTH = PDF_MAX_BYTES + MULTIPART_SLACK;

function jsonError(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Reject cross-origin uploads (CSRF defence; D15 "same-origin check"). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin requests may omit Origin
  try {
    const o = new URL(origin);
    const host = request.headers.get("host");
    if (!host) return true;
    return o.host === host || o.host === `localhost:${new URL(request.url).port}`;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) {
    return jsonError(403, {
      error: { code: "forbidden", message: "Cross-origin upload rejected.", requestId: "" },
    });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_CONTENT_LENGTH) {
    return jsonError(400, {
      error: { code: "validation_error", message: "Attachment too large.", requestId: "" },
    });
  }

  const ctx = await getContext(request);
  if (!ctx.user) {
    return jsonError(401, {
      error: { code: "unauthorized", message: "Sign in to upload files.", requestId: ctx.requestId },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, {
      error: {
        code: "validation_error",
        message: "Expected multipart/form-data with a 'file' field.",
        requestId: ctx.requestId,
      },
    });
  }

  const file = form.get("file");
  const entityId = form.get("entityId");
  if (!(file instanceof File) || typeof entityId !== "string") {
    return jsonError(400, {
      error: {
        code: "validation_error",
        message: "Expected 'file' and 'entityId' fields.",
        requestId: ctx.requestId,
      },
    });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadAttachment(
      { user: ctx.user, via: ctx.via, now: ctx.now, requestId: ctx.requestId },
      entityId,
      { name: file.name, bytes },
    );
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof ORPCError) {
      const statusMap: Record<string, number> = {
        validation_error: 400,
        unauthorized: 401,
        forbidden: 403,
        not_found: 404,
        conflict: 409,
      };
      return jsonError(statusMap[err.code] ?? 500, encodeErrorBody(err as never));
    }
    return jsonError(500, {
      error: { code: "internal_error", message: "An unexpected error occurred.", requestId: ctx.requestId },
    });
  }
}
