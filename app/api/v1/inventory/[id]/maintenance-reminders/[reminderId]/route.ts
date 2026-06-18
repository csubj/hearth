import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError, validationError } from "@/lib/api/errors";
import {
  deleteInventoryMaintenanceReminderApi,
  getInventoryMaintenanceReminderApi,
  serializeInventoryMaintenanceReminder,
  updateInventoryMaintenanceReminderApi,
} from "@/lib/api/inventory-maintenance-resources";
import { updateInventoryMaintenanceReminderSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string; reminderId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: inventoryItemId, reminderId } = await context.params;
  const row = await getInventoryMaintenanceReminderApi(inventoryItemId, reminderId);
  if (!row) return notFoundError();
  return Response.json(serializeInventoryMaintenanceReminder(row));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: inventoryItemId, reminderId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateInventoryMaintenanceReminderSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const row = await updateInventoryMaintenanceReminderApi(
    auth.user,
    inventoryItemId,
    reminderId,
    parsed.data,
  );
  if (!row) return notFoundError();
  return Response.json(serializeInventoryMaintenanceReminder(row));
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: inventoryItemId, reminderId } = await context.params;
  const deleted = await deleteInventoryMaintenanceReminderApi(inventoryItemId, reminderId);
  if (!deleted) return notFoundError();
  return new Response(null, { status: 204 });
}
