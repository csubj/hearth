import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";

export const openApiRegistry = new OpenAPIRegistry();

const bearerAuth = openApiRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "API token",
  description: "API token created in Admin → API tokens or via the auth:create-token CLI",
});

const jsonObject = { type: "object" } as const;
const paginatedList = {
  type: "object",
  properties: {
    data: { type: "array", items: jsonObject },
    nextCursor: { type: "string", nullable: true },
  },
} as const;

export type RegisterResourceOptions = {
  tag: string;
  basePath: string;
  entityName: string;
};

export function registerResource(options: RegisterResourceOptions): void {
  const { tag, basePath, entityName } = options;

  openApiRegistry.registerPath({
    method: "get",
    path: basePath,
    tags: [tag],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: { description: `List ${tag}`, content: { "application/json": { schema: paginatedList } } },
      401: { description: "Unauthorized" },
    },
  });

  openApiRegistry.registerPath({
    method: "post",
    path: basePath,
    tags: [tag],
    security: [{ [bearerAuth.name]: [] }],
    requestBody: {
      content: { "application/json": { schema: jsonObject } },
    },
    responses: {
      201: {
        description: `Created ${entityName}`,
        content: { "application/json": { schema: jsonObject } },
      },
      400: { description: "Validation error" },
      401: { description: "Unauthorized" },
    },
  });

  openApiRegistry.registerPath({
    method: "get",
    path: `${basePath}/{id}`,
    tags: [tag],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: {
        description: `Get ${entityName}`,
        content: { "application/json": { schema: jsonObject } },
      },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "patch",
    path: `${basePath}/{id}`,
    tags: [tag],
    security: [{ [bearerAuth.name]: [] }],
    requestBody: {
      content: { "application/json": { schema: jsonObject } },
    },
    responses: {
      200: {
        description: `Updated ${entityName}`,
        content: { "application/json": { schema: jsonObject } },
      },
      400: { description: "Validation error" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "delete",
    path: `${basePath}/{id}`,
    tags: [tag],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      204: { description: "Deleted" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });
}

export function registerProjectComponentsResource(): void {
  const basePath = "/api/v1/projects/{projectId}/components";

  openApiRegistry.registerPath({
    method: "get",
    path: basePath,
    tags: ["Projects"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: {
        description: "List project components",
        content: { "application/json": { schema: paginatedList } },
      },
      401: { description: "Unauthorized" },
      404: { description: "Project not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "post",
    path: basePath,
    tags: ["Projects"],
    security: [{ [bearerAuth.name]: [] }],
    requestBody: {
      content: { "application/json": { schema: jsonObject } },
    },
    responses: {
      201: {
        description: "Created project component",
        content: { "application/json": { schema: jsonObject } },
      },
      400: { description: "Validation error" },
      401: { description: "Unauthorized" },
      404: { description: "Project not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "get",
    path: `${basePath}/{id}`,
    tags: ["Projects"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: {
        description: "Get project component",
        content: { "application/json": { schema: jsonObject } },
      },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "patch",
    path: `${basePath}/{id}`,
    tags: ["Projects"],
    security: [{ [bearerAuth.name]: [] }],
    requestBody: {
      content: { "application/json": { schema: jsonObject } },
    },
    responses: {
      200: {
        description: "Updated project component",
        content: { "application/json": { schema: jsonObject } },
      },
      400: { description: "Validation error" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "delete",
    path: `${basePath}/{id}`,
    tags: ["Projects"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      204: { description: "Deleted" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });
}

export function registerMetricEntriesResource(): void {
  const basePath = "/api/v1/metrics/{metricId}/entries";

  openApiRegistry.registerPath({
    method: "get",
    path: basePath,
    tags: ["Metrics"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      200: {
        description: "List metric entries",
        content: { "application/json": { schema: paginatedList } },
      },
      401: { description: "Unauthorized" },
      404: { description: "Metric not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "post",
    path: basePath,
    tags: ["Metrics"],
    security: [{ [bearerAuth.name]: [] }],
    requestBody: {
      content: { "application/json": { schema: jsonObject } },
    },
    responses: {
      201: {
        description: "Created metric entry",
        content: { "application/json": { schema: jsonObject } },
      },
      400: { description: "Validation error" },
      401: { description: "Unauthorized" },
      404: { description: "Metric not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "patch",
    path: `${basePath}/{id}`,
    tags: ["Metrics"],
    security: [{ [bearerAuth.name]: [] }],
    requestBody: {
      content: { "application/json": { schema: jsonObject } },
    },
    responses: {
      200: {
        description: "Updated metric entry",
        content: { "application/json": { schema: jsonObject } },
      },
      400: { description: "Validation error" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });

  openApiRegistry.registerPath({
    method: "delete",
    path: `${basePath}/{id}`,
    tags: ["Metrics"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
      204: { description: "Deleted" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  });
}

export function getOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "hearth API",
      version: "1.0.0",
      description: "Programmatic REST API for hearth household coordination",
    },
    servers: [{ url: "/" }],
  });
}
