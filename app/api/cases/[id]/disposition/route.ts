import { NextResponse } from "next/server";
import { disposeEscalation } from "@/lib/services/case-actions";
import { escalationDispositionSchema } from "@/lib/domain/schemas";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = escalationDispositionSchema.parse(await request.json());
    const result = await disposeEscalation(id, input, requireIdempotencyKey(request));
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Idempotency-Replayed": String(result.replayed) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
