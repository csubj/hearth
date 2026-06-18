# OpenAPI & interactive docs

hearth serves a machine-readable **OpenAPI 3.x** specification and an interactive documentation UI alongside the REST API.

## Live endpoints

| Surface | URL | Auth |
| ------- | --- | ---- |
| OpenAPI spec (JSON) | `GET /api/openapi.json` | Public |
| Interactive docs | `/api/docs` | Public |

Replace the host with your instance URL, e.g. `https://hearth.example.com/api/openapi.json`.

The spec documents every `/api/v1/*` path, its HTTP methods, the bearer-token security scheme, and the paginated list envelope (`data` + `nextCursor`). Request and response bodies are declared as generic JSON objects; the authoritative, field-level shapes live in the Zod schemas in `src/lib/api/schemas.ts` that the handlers enforce.

## How the spec is generated

hearth does not maintain a hand-written OpenAPI file. Instead:

1. **Zod schemas** in `src/lib/api/schemas.ts` define request bodies and response shapes and are enforced by every route handler at runtime
2. **`@asteasolutions/zod-to-openapi`** (in `src/lib/api/openapi.ts`) registers each route's path, method, bearer security, and response envelope into an OpenAPI registry
3. **`GET /api/openapi.json`** emits the registry as JSON at runtime — generated from the same handlers that serve the API

This keeps validation and documentation in one place. When a schema changes, the spec updates automatically on the next deploy.

## Interactive docs UI

`/api/docs` renders the spec in a browser UI (Scalar via `@scalar/nextjs-api-reference` — see [Tech Choices](../design/01_tech.md)). Use it to:

- Browse all `/api/v1/*` endpoints
- Inspect request/response examples
- Try authenticated requests (paste a bearer token)

The docs page is public; trying endpoints still requires a valid API token.

## Using the spec in tools

### Code generation

Point your OpenAPI client generator at the live spec:

```bash
curl -o openapi.json https://hearth.example.com/api/openapi.json
# feed openapi.json to openapi-generator, orval, etc.
```

### CI / contract tests

Fetch the spec in CI and diff against a previous version to catch breaking API changes:

```bash
curl -sf https://hearth.example.com/api/openapi.json | jq '.paths | keys'
```

### Import into API clients

Postman, Insomnia, and Bruno can import `https://your-instance/api/openapi.json` directly. Set the `Authorization: Bearer <token>` header in the collection or environment.

## Security scheme

The spec declares HTTP bearer auth:

```yaml
securitySchemes:
  bearerAuth:
    type: http
    scheme: bearer
    bearerFormat: API token
```

All `/api/v1/*` operations require this scheme. Token creation and revocation are covered in [Configuration](../operations/configuration.md) and [Authentication](../design/02_auth.md).

## Related

- [API reference](api.md) — human-readable overview of resources, pagination, and errors
- [Routes & Structure](../design/04_routes.md) — handler layout under `app/api/v1/`
- [Tech Choices](../design/01_tech.md) — Zod, zod-to-openapi, Scalar/Redoc decisions
