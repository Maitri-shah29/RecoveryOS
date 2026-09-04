import { NextResponse } from "next/server";
import { getActivePolicy, policyConfigSchema, updatePolicy } from "@/lib/services/policy-config";
import { apiErrorResponse, requireIdempotencyKey } from "@/lib/http/api";
export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json(await getActivePolicy()); } catch (error) { return apiErrorResponse(error); } }
export async function POST(request: Request) { try { const config = policyConfigSchema.parse(await request.json()); const result = await updatePolicy(config, requireIdempotencyKey(request)); return NextResponse.json(result.body, { status: result.status, headers: { "Idempotency-Replayed": String(result.replayed) } }); } catch (error) { return apiErrorResponse(error); } }
