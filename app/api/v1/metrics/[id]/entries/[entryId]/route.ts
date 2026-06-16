import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteMetricEntryApi,
  getMetricEntryApi,
  serializeMetricEntry,
  updateMetricEntryApi,
} from "@/lib/api/resources";
import { updateMetricEntrySchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string; entryId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: metricId, entryId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateMetricEntrySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await updateMetricEntryApi(metricId, entryId, parsed.data);
  if (!row) return notFoundError();
  return Response.json(serializeMetricEntry(row));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: metricId, entryId } = await context.params;
  const deleted = await deleteMetricEntryApi(metricId, entryId);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: metricId, entryId } = await context.params;
  const row = await getMetricEntryApi(metricId, entryId);
  if (!row) return notFoundError();
  return Response.json(serializeMetricEntry(row));
}
