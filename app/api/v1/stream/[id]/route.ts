import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteStreamEntry,
  getStreamEntry,
  serializeStreamEntry,
  updateStreamEntry,
} from "@/lib/api/resources";
import { updateStreamEntrySchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const row = await getStreamEntry(id);
  if (!row) {
    return notFoundError();
  }

  return Response.json(serializeStreamEntry(row));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateStreamEntrySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const row = await updateStreamEntry(auth.user, id, parsed.data);
  if (!row) {
    return notFoundError();
  }

  return Response.json(serializeStreamEntry(row));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const deleted = await deleteStreamEntry(id);
  if (!deleted) {
    return notFoundError();
  }

  return new Response(null, { status: 204 });
}
