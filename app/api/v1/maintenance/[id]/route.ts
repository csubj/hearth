import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteMaintenanceLogApi,
  getMaintenanceLogApi,
  serializeMaintenanceLog,
  updateMaintenanceLogApi,
} from "@/lib/api/maintenance-resources";
import { updateMaintenanceLogSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const row = await getMaintenanceLogApi(id);
  if (!row) return notFoundError();
  return Response.json(serializeMaintenanceLog(row, row.tags));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateMaintenanceLogSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await updateMaintenanceLogApi(auth.user, id, parsed.data);
  if (!row) return notFoundError();
  return Response.json(serializeMaintenanceLog(row, row.tags));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const deleted = await deleteMaintenanceLogApi(id);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}
