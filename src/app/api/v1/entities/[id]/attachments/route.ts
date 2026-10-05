/**
 * REST multipart attachment upload (design D15, task 8.4).
 *
 * `POST /api/v1/entities/{id}/attachments`, bearer-key only (no cookies), so
 * it is safe from CSRF. Requests with a Content-Length above the limit are
 * rejected before the body is read; the upload then goes through the single
 * `uploadAttachment` path (sniff > temp file > row > rename after commit).
 */

import { getContext, type AppContext } from "@/server/context";
import { uploadAttachment, PDF_MAX_BYTES, IMAGE_MAX_BYTES } from "@/server/attachments";
import { encodeErrorBody } from "@/server/orpc";
import { ORPCError } from "@orpc/server";

const BEARER_RE = /^Bearer\s+(.+)$/i;

/** Slack for multipart boundaries / headers. */
const MULTIPART_SLACK = 256 * 1024;
const MAX_CONTENT_LENGTH = PDF_MAX_BYTES + MULTIPART_SLACK;

function jsonError(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  // Bearer-only: reject cookies that lack a bearer key.
  const auth = request.headers.get("authorization");
  if (!auth || !BEARER_RE.test(auth)) {
    return jsonError(401, {
      error: {
        code: "unauthorized",
        message: "A valid API key is required. Pass Authorization: Bearer <key>.",
        requestId: "",
      },
    });
  }

  // Reject oversized requests before reading the body (spec).
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_CONTENT_LENGTH) {
    return jsonError(400, {
      error: {
        code: "validation_error",
        message: "Attachment too large.",
        requestId: "",
      },
    });
  }

  let ctx: AppContext;
  try {
    ctx = await getContext(request);
  } catch {
    return jsonError(500, {
      error: { code: "internal_error", message: "Failed to resolve auth context.", requestId: "" },
    });
  }
  if (!ctx.user) {
    return jsonError(401, {
      error: {
        code: "unauthorized",
        message: "Invalid or revoked API key.",
        requestId: ctx.requestId,
      },
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
  if (!(file instanceof File)) {
    return jsonError(400, {
      error: {
        code: "validation_error",
        message: "Expected a 'file' field.",
        requestId: ctx.requestId,
      },
    });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadAttachment(
      { user: ctx.user, via: ctx.via, now: ctx.now, requestId: ctx.requestId },
      id,
      { name: file.name, bytes },
    );
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof ORPCError) {
      return jsonError(
        mapStatus(err.code),
        encodeErrorBody(err as never),
      );
    }
    return jsonError(500, {
      error: { code: "internal_error", message: "An unexpected error occurred.", requestId: ctx.requestId },
    });
  }
}

function mapStatus(code: string): number {
  switch (code) {
    case "validation_error":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    default:
      return 500;
  }
}

export const IMAGE_MAX = IMAGE_MAX_BYTES;
