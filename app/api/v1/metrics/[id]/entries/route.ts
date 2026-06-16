import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import { paginationQuerySchema } from "@/lib/api/pagination";
import {
  createMetricEntryApi,
  getMetricApi,
  listMetricEntriesApi,
  serializeMetricEntry,
} from "@/lib/api/resources";
import { createMetricEntrySchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: metricId } = await context.params;
  const metric = await getMetricApi(metricId);
  if (!metric) return notFoundError("Metric not found");

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listMetricEntriesApi(metricId, query.data);
  return Response.json({
    data: page.data.map(serializeMetricEntry),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: metricId } = await context.params;
  const metric = await getMetricApi(metricId);
  if (!metric) return notFoundError("Metric not found");

  const body = await request.json().catch(() => null);
  const parsed = createMetricEntrySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createMetricEntryApi(auth.user, metricId, parsed.data);
  if (!row) return notFoundError("Metric not found");
  return Response.json(serializeMetricEntry(row), { status: 201 });
}
