import { NextResponse } from "next/server";
import { operatingModeSchema } from "@/lib/domain/schemas";
import { importBatch } from "@/lib/services/ingestion";
import { parseCasesCsv } from "@/lib/ingestion/csv";
import { apiErrorResponse, ApiError, requireIdempotencyKey } from "@/lib/http/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const idempotencyKey = requireIdempotencyKey(request);
    const contentType = request.headers.get("content-type") ?? "";
    const mode = operatingModeSchema.parse(request.headers.get("x-recovery-mode") ?? "BENCHMARK");
    let datasetVersion: string;
    let cases: unknown[];
    let rejectedRows: { row: number; issues: string[] }[] = [];
    if (contentType.includes("text/csv")) {
      datasetVersion = request.headers.get("x-dataset-version")?.trim() ?? "";
      if (!datasetVersion) throw new ApiError(400, "X-Dataset-Version is required for CSV imports.");
      const parsed = parseCasesCsv(await request.text());
      cases = parsed.accepted;
      rejectedRows = parsed.rejected;
    } else {
      const body = await request.json() as { dataset_version?: string; cases?: unknown[] } | unknown[];
      datasetVersion = Array.isArray(body) ? request.headers.get("x-dataset-version")?.trim() ?? "" : body.dataset_version ?? "";
      cases = Array.isArray(body) ? body : body.cases ?? [];
      if (!datasetVersion) throw new ApiError(400, "dataset_version is required.");
    }
    const result = await importBatch({ datasetVersion, mode, cases, rejectedRows }, idempotencyKey);
    return NextResponse.json(result.body, { status: result.status, headers: { "Idempotency-Replayed": String(result.replayed) } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
