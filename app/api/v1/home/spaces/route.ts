import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import {
  createHomeSpaceApi,
  listHomeSpacesApi,
  serializeHomeSpace,
} from "@/lib/api/home-resources";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createHomeSpaceSchema } from "@/lib/api/schemas";

const homeSpaceListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  kind: z.string().optional(),
  parentId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = homeSpaceListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listHomeSpacesApi(query.data);
  return Response.json({
    data: page.data.map(serializeHomeSpace),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createHomeSpaceSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createHomeSpaceApi(auth.user, parsed.data);
  if (!row) {
    return Response.json(
      { error: { code: "internal_error", message: "Failed to create space" } },
      { status: 500 },
    );
  }
  return Response.json(serializeHomeSpace(row), { status: 201 });
}
