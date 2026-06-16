import { revalidatePath } from "next/cache";
import { validateApiSession, unauthorizedResponse } from "@/lib/attachments/auth";
import { importInventoryData } from "@/lib/actions/inventory";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const session = await validateApiSession();
  if (!session.user) {
    return unauthorizedResponse();
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await importInventoryData(payload, session.user.id);
    revalidatePath("/inventory");
    revalidatePath("/");
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
