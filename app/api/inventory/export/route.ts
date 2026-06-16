import { validateApiSession, unauthorizedResponse } from "@/lib/attachments/auth";
import { buildInventoryExport } from "@/lib/actions/inventory";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const session = await validateApiSession();
  if (!session.user) {
    return unauthorizedResponse();
  }

  const payload = await buildInventoryExport();
  const filename = `hearth-inventory-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
