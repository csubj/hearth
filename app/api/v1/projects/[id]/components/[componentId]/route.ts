import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteProjectComponentApi,
  getProjectComponentApi,
  serializeProjectComponent,
  updateProjectComponentApi,
} from "@/lib/api/resources";
import { updateProjectComponentSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string; componentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: projectId, componentId } = await context.params;
  const row = await getProjectComponentApi(projectId, componentId);
  if (!row) return notFoundError();
  return Response.json(serializeProjectComponent(row));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: projectId, componentId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateProjectComponentSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await updateProjectComponentApi(auth.user, projectId, componentId, parsed.data);
  if (!row) return notFoundError();
  return Response.json(serializeProjectComponent(row));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: projectId, componentId } = await context.params;
  const deleted = await deleteProjectComponentApi(projectId, componentId);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}
