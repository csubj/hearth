import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  createInventoryMaintenanceReminderApi,
  listInventoryMaintenanceRemindersApi,
  serializeInventoryMaintenanceReminder,
} from "@/lib/api/inventory-maintenance-resources";
import { getInventoryItemApi } from "@/lib/api/inventory-resources";
import { paginationQuerySchema } from "@/lib/api/pagination";
import { createInventoryMaintenanceReminderSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: inventoryItemId } = await context.params;
  const item = await getInventoryItemApi(inventoryItemId);
  if (!item) return notFoundError("Inventory item not found");

  const query = paginationQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!query.success) return validationError(query.error);

  const page = await listInventoryMaintenanceRemindersApi(inventoryItemId, query.data);
  if (!page) return notFoundError("Inventory item not found");

  return Response.json({
    data: page.data.map(serializeInventoryMaintenanceReminder),
    nextCursor: page.nextCursor,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: inventoryItemId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = createInventoryMaintenanceReminderSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await createInventoryMaintenanceReminderApi(auth.user, inventoryItemId, parsed.data);
  if (!row) return notFoundError("Inventory item not found");
  return Response.json(serializeInventoryMaintenanceReminder(row), { status: 201 });
}
