import { NextResponse } from "next/server";
import { approveCase } from "@/lib/services/approval";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const { id } = await params; const result = await approveCase(id, requireIdempotencyKey(request)); return NextResponse.json(result.body, { status: result.status, headers: { "Idempotency-Replayed": String(result.replayed) } }); } catch (error) { return apiErrorResponse(error); } }
