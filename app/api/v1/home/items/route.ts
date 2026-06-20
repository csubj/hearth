import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { createHomeItemApi, listHomeItemsApi, serializeHomeItem } from "@/lib/api/home-resources";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createHomeItemSchema } from "@/lib/api/schemas";

const homeItemListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  kind: z.string().optional(),
  spaceId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = homeItemListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listHomeItemsApi(query.data);
  return Response.json({
    data: page.data.map(serializeHomeItem),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createHomeItemSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createHomeItemApi(auth.user, parsed.data);
  if (!row) {
    return Response.json(
      { error: { code: "internal_error", message: "Failed to create item" } },
      { status: 500 },
    );
  }
  return Response.json(serializeHomeItem(row), { status: 201 });
}
