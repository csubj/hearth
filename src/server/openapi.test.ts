/**
 * OpenAPI generation tests (task 6.6, design D5).
 *
 * Verifies the generated document from the root router contains concrete
 * field schemas for the sample module (notes-page: title, category,
 * reviewOn) and the spec-defined error body schema.
 */

import { describe, expect, it } from "vitest";
import { generateOpenApiDoc } from "./openapi";

interface OpenApiDoc {
  openapi: string;
  info: { title: string };
  servers: unknown[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, Record<string, unknown>>;
  };
}

async function getDoc(): Promise<OpenApiDoc> {
  return (await generateOpenApiDoc()) as OpenApiDoc;
}

describe("OpenAPI document (6.6)", () => {
  it("is generated for the root router with the OpenAPI version", async () => {
    const doc = await getDoc();
    expect(doc.openapi).toMatch(/^3\.1/);
    expect(doc.info.title).toBe("hearth API");
    expect(doc.servers).toBeDefined();
  });

  it("exposes the notes-page create route with concrete field schemas", async () => {
    const doc = await getDoc();
    const create = doc.paths["/notes-page"]?.post as {
      requestBody: {
        content: {
          "application/json": { schema: Record<string, unknown> };
        };
      };
    } | undefined;
    expect(create).toBeDefined();

    const schema = create!.requestBody.content["application/json"].schema as {
      properties: Record<string, Record<string, unknown>>;
      required?: string[];
    };

    // title: string, min 1, max 200
    const title = schema.properties.title;
    expect(title?.type).toBe("string");
    expect(title?.minLength).toBe(1);
    expect(title?.maxLength).toBe(200);
    expect(schema.required).toContain("title");

    // category: enum of the four values
    const category = schema.properties.category;
    expect(category?.type).toBe("string");
    expect(category?.enum).toEqual([
      "reference",
      "how-to",
      "contacts",
      "other",
    ]);

    // reviewOn: date pattern
    const reviewOn = schema.properties.reviewOn;
    expect(reviewOn?.type).toBe("string");
    expect(reviewOn?.pattern).toBeDefined();
    expect(reviewOn?.pattern).toContain("\\d{4}");
  });

  it("registers the spec-defined error body schema with concrete types", async () => {
    const doc = await getDoc();
    const errorBody = doc.components.schemas.ErrorBody as {
      type: string;
      properties: {
        error: {
          type: string;
          properties: {
            code: { type: string };
            message: { type: string };
            details: {
              type: string;
              items: {
                type: string;
                properties: { path: { type: string }; message: { type: string } };
                required: string[];
              };
            };
            requestId: { type: string };
          };
          required: string[];
        };
      };
      required: string[];
    };

    expect(errorBody).toBeDefined();
    expect(errorBody.type).toBe("object");
    const error = errorBody.properties.error;
    expect(error.type).toBe("object");
    expect(error.properties.code.type).toBe("string");
    expect(error.properties.message.type).toBe("string");
    expect(error.properties.requestId.type).toBe("string");
    expect(error.properties.details.type).toBe("array");
    expect(error.properties.details.items.properties.path.type).toBe("string");
    expect(error.properties.details.items.properties.message.type).toBe("string");
    expect(error.required).toEqual(expect.arrayContaining(["code", "message", "requestId"]));
    expect(errorBody.required).toContain("error");
  });
});
