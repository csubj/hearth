import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import {
  createInventoryTagApi,
  listInventoryTagsApi,
  serializeInventoryTag,
} from "@/lib/api/inventory-resources";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createInventoryTagSchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listInventoryTagsApi(query.data);
  return Response.json({
    data: page.data.map(serializeInventoryTag),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createInventoryTagSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createInventoryTagApi(auth.user, parsed.data);
  if (!row) {
    return Response.json({ error: { code: "internal_error", message: "Failed to create tag" } }, {
      status: 500,
    });
  }
  return Response.json(serializeInventoryTag(row), { status: 201 });
}
