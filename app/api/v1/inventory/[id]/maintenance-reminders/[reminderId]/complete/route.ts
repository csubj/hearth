import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { notFoundError } from "@/lib/api/errors";
import {
  completeInventoryMaintenanceReminderApi,
  serializeInventoryMaintenanceReminder,
} from "@/lib/api/inventory-maintenance-resources";

type RouteContext = { params: Promise<{ id: string; reminderId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const { id: inventoryItemId, reminderId } = await context.params;
  const row = await completeInventoryMaintenanceReminderApi(inventoryItemId, reminderId);
  if (!row) return notFoundError();
  return Response.json(serializeInventoryMaintenanceReminder(row));
}
