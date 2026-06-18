import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import { paginationQuerySchema } from "@/lib/api/pagination";
import {
  createProjectComponentApi,
  getProjectApi,
  listProjectComponentsApi,
  serializeProjectComponent,
} from "@/lib/api/resources";
import { createProjectComponentSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: projectId } = await context.params;
  const project = await getProjectApi(projectId);
  if (!project) return notFoundError("Project not found");

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listProjectComponentsApi(projectId, query.data);
  return Response.json({
    data: page.data.map(serializeProjectComponent),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: projectId } = await context.params;
  const project = await getProjectApi(projectId);
  if (!project) return notFoundError("Project not found");

  const body = await request.json().catch(() => null);
  const parsed = createProjectComponentSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createProjectComponentApi(auth.user, projectId, parsed.data);
  if (!row) return notFoundError("Project not found");
  return Response.json(serializeProjectComponent(row), { status: 201 });
}
