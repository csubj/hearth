import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { listInventoryTypesApi } from "@/lib/api/inventory-resources";
import { inventoryTypeSchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const types = await listInventoryTypesApi();
  return Response.json({
    data: types.map((name) => inventoryTypeSchema.parse({ name })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = inventoryTypeSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  return Response.json(parsed.data, { status: 201 });
}
