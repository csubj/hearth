import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteInventoryTagApi,
  getInventoryTagApi,
  serializeInventoryTag,
  updateInventoryTagApi,
} from "@/lib/api/inventory-resources";
import { updateInventoryTagSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const row = await getInventoryTagApi(id);
  if (!row) return notFoundError();
  return Response.json(serializeInventoryTag(row));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateInventoryTagSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await updateInventoryTagApi(id, parsed.data);
  if (!row) return notFoundError();
  return Response.json(serializeInventoryTag(row));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const deleted = await deleteInventoryTagApi(id);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}
