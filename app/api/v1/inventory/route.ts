import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import {
  createInventoryItemApi,
  listInventoryItemsApi,
  serializeInventoryItem,
} from "@/lib/api/inventory-resources";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createInventoryItemSchema } from "@/lib/api/schemas";

const inventoryListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  tag: z.string().optional(),
  type: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = inventoryListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listInventoryItemsApi(query.data);
  return Response.json({
    data: page.data.map((row) => serializeInventoryItem(row, row.tags)),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createInventoryItemSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createInventoryItemApi(auth.user, parsed.data);
  if (!row) {
    return Response.json(
      { error: { code: "internal_error", message: "Failed to create item" } },
      {
        status: 500,
      },
    );
  }
  return Response.json(serializeInventoryItem(row, row.tags), { status: 201 });
}
