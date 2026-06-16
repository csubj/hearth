import "@/lib/api/register-openapi";
import { getOpenApiDocument } from "@/lib/api/openapi";

export function GET(): Response {
  const document = getOpenApiDocument();
  return Response.json(document);
}
