import { NextResponse } from "next/server";
import { planBatch } from "@/lib/services/planning";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await planBatch(id, requireIdempotencyKey(request));
    return NextResponse.json(result.body, { status: result.status, headers: { "Idempotency-Replayed": String(result.replayed) } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
