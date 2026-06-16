import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createMetricApi, listMetricsApi, serializeMetric } from "@/lib/api/resources";
import { createMetricSchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listMetricsApi(query.data);
  return Response.json({
    data: page.data.map(serializeMetric),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createMetricSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createMetricApi(auth.user, parsed.data);
  return Response.json(serializeMetric(row), { status: 201 });
}
