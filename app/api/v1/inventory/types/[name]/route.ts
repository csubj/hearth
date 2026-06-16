import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteInventoryTypeApi,
  listInventoryTypesApi,
  renameInventoryTypeApi,
} from "@/lib/api/inventory-resources";
import { inventoryTypeSchema, renameInventoryTypeSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { name } = await context.params;
  const decoded = decodeURIComponent(name);
  const types = await listInventoryTypesApi();
  if (!types.includes(decoded)) {
    return notFoundError();
  }
  return Response.json(inventoryTypeSchema.parse({ name: decoded }));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { name } = await context.params;
  const decoded = decodeURIComponent(name);
  const body = await request.json().catch(() => null);
  const parsed = renameInventoryTypeSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await renameInventoryTypeApi(decoded, parsed.data);
  if (!row) return notFoundError();
  return Response.json(row);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { name } = await context.params;
  const decoded = decodeURIComponent(name);
  const deleted = await deleteInventoryTypeApi(decoded);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}
