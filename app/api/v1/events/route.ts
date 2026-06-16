import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createEventApi, listEventsApi, serializeEvent } from "@/lib/api/resources";
import { createEventSchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listEventsApi(query.data);
  return Response.json({
    data: page.data.map(serializeEvent),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createEventApi(auth.user, parsed.data);
  return Response.json(serializeEvent(row), { status: 201 });
}
