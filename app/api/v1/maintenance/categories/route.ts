import type { NextRequest } from "next/server";
import { requireApiToken } from "@/lib/api/auth";
import { listMaintenanceCategoriesApi } from "@/lib/api/maintenance-resources";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request);
  if (!auth.ok) return auth.response;

  const categories = await listMaintenanceCategoriesApi();
  return Response.json({ data: categories });
}
