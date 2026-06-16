import type { ZodError } from "zod";

export type ApiErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal_error";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: ApiErrorBody["error"]["details"],
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  if (details?.length) {
    body.error.details = details;
  }
  return Response.json(body, { status });
}

export function unauthorizedError(message = "Missing or invalid bearer token"): Response {
  return apiError("unauthorized", message, 401);
}

export function notFoundError(message = "Resource not found"): Response {
  return apiError("not_found", message, 404);
}

export function validationError(error: ZodError): Response {
  return apiError(
    "validation_error",
    error.errors[0]?.message ?? "Validation failed",
    400,
    error.errors.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
}

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}
