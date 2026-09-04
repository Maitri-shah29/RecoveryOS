import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 8 || key.length > 200) throw new ApiError(400, "A valid Idempotency-Key header is required.");
  return key;
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message, details: error.details ?? null }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 422 });
  console.error("Unhandled API error", error instanceof Error ? { name: error.name, message: error.message } : { type: typeof error });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
