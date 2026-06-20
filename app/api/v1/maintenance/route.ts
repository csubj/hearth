import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/lib/api/auth";
import { validationError } from "@/lib/api/errors";
import {
  createMaintenanceLogApi,
  listMaintenanceLogsApi,
  serializeMaintenanceLog,
} from "@/lib/api/maintenance-resources";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createMaintenanceLogSchema } from "@/lib/api/schemas";

const maintenanceListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  tag: z.string().optional(),
  category: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const query = maintenanceListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listMaintenanceLogsApi(query.data);
  return Response.json({
    data: page.data.map((row) => serializeMaintenanceLog(row, row.tags)),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createMaintenanceLogSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createMaintenanceLogApi(auth.user, parsed.data);
  if (!row) {
    return Response.json(
      { error: { code: "internal_error", message: "Failed to create maintenance log" } },
      { status: 500 },
    );
  }
  return Response.json(serializeMaintenanceLog(row, row.tags), { status: 201 });
}
