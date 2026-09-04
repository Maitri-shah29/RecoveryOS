import { NextResponse } from "next/server";
import { z } from "zod";
import { advanceBenchmarkClock } from "@/lib/services/benchmark-executor";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";
const inputSchema = z.object({ now: z.string().datetime({ offset: true }) }).strict();
export const runtime = "nodejs";
export async function POST(request: Request) { try { const input = inputSchema.parse(await request.json()); const result = await advanceBenchmarkClock(new Date(input.now), requireIdempotencyKey(request)); return NextResponse.json(result.body, { status: result.status, headers: { "Idempotency-Replayed": String(result.replayed) } }); } catch (error) { return apiErrorResponse(error); } }
