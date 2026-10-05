/**
 * Public Scalar API reference (design D5, task 6.6).
 *
 * Serves the Scalar docs UI at `GET /api/docs`, loading the OpenAPI document
 * from `/api/openapi.json`. Public — no bearer or session required.
 */

/** Escape a string for safe HTML interpolation. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const SCALAR_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/@scalar/api-reference";

export function GET(): Response {
  const specUrl = "/api/openapi.json";
  const title = "hearth API";
  const config = JSON.stringify({
    spec: { url: specUrl },
    hideDownloadButton: false,
  });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${escapeHtml(SCALAR_SCRIPT_URL)}"></script>
    <script>
      const scalarConfig = ${config};
      Scalar.createApiReference('#app', scalarConfig);
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
