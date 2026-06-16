import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { paginationQuerySchema } from "@/lib/api/pagination";
import {
  createStreamEntry,
  listStreamEntries,
  serializeStreamEntry,
} from "@/lib/api/resources";
import { createStreamEntrySchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) {
    return auth.response;
  }

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) {
    return validationError(query.error);
  }

  const page = await listStreamEntries(query.data);
  return Response.json({
    data: page.data.map(serializeStreamEntry),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createStreamEntrySchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const row = await createStreamEntry(auth.user, parsed.data);
  return Response.json(serializeStreamEntry(row), { status: 201 });
}
