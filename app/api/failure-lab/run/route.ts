import { NextResponse } from "next/server";
import { runFailureLab } from "@/lib/services/failure-lab";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";
export const runtime = "nodejs";
export async function POST(request: Request) { try { requireIdempotencyKey(request); return NextResponse.json(await runFailureLab()); } catch (error) { return apiErrorResponse(error); } }
