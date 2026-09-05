import { NextResponse } from "next/server";
import { modifyCasePlan } from "@/lib/services/case-actions";
import { operatorPlanModificationSchema } from "@/lib/domain/schemas";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = operatorPlanModificationSchema.parse(await request.json());
    const result = await modifyCasePlan(id, {
      action: input.action,
      delayMinutes: input.delay_minutes,
      reason: input.reason,
    }, requireIdempotencyKey(request));
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Idempotency-Replayed": String(result.replayed) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
