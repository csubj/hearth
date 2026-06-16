import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { paginationQuerySchema } from "@/lib/api/pagination";
import {
  createRestaurantApi,
  listRestaurantsApi,
  serializeRestaurant,
} from "@/lib/api/resources";
import { createRestaurantSchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listRestaurantsApi(query.data);
  return Response.json({
    data: page.data.map(serializeRestaurant),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createRestaurantSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createRestaurantApi(auth.user, parsed.data);
  return Response.json(serializeRestaurant(row), { status: 201 });
}
