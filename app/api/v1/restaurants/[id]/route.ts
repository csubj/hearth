import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteRestaurantApi,
  getRestaurantApi,
  serializeRestaurant,
  updateRestaurantApi,
} from "@/lib/api/resources";
import { updateRestaurantSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const row = await getRestaurantApi(id);
  if (!row) return notFoundError();
  return Response.json(serializeRestaurant(row));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateRestaurantSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await updateRestaurantApi(auth.user, id, parsed.data);
  if (!row) return notFoundError();
  return Response.json(serializeRestaurant(row));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const deleted = await deleteRestaurantApi(id);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}
