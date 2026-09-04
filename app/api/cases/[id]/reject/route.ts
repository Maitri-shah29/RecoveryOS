import { NextResponse } from "next/server";
import { operatorReasonSchema } from "@/lib/domain/schemas";
import { rejectCase } from "@/lib/services/case-actions";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const { id } = await params; const { reason } = operatorReasonSchema.parse(await request.json()); const result = await rejectCase(id, reason, requireIdempotencyKey(request)); return NextResponse.json(result.body, { status: result.status, headers: { "Idempotency-Replayed": String(result.replayed) } }); } catch (error) { return apiErrorResponse(error); } }
