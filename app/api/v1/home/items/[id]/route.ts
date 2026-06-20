import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteHomeItemApi,
  getHomeItemApi,
  serializeHomeItem,
  updateHomeItemApi,
} from "@/lib/api/home-resources";
import { updateHomeItemSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const row = await getHomeItemApi(id);
  if (!row) return notFoundError();
  return Response.json(serializeHomeItem(row));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateHomeItemSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await updateHomeItemApi(auth.user, id, parsed.data);
  if (!row) return notFoundError();
  return Response.json(serializeHomeItem(row));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const deleted = await deleteHomeItemApi(id);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}
