import { NextResponse } from "next/server";
import type { BenchmarkReport } from "@/lib/benchmark/evaluator";
import { apiErrorResponse } from "@/lib/http/api";
import { evaluationCsv, getEvaluation } from "@/lib/services/evaluations";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const { id } = await params; const value = await getEvaluation(id); const result = value.result as unknown as BenchmarkReport; const url = new URL(request.url); if (url.searchParams.get("format") === "csv" || request.headers.get("accept")?.includes("text/csv")) return new NextResponse(evaluationCsv(result), { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${id}.csv"` } }); return NextResponse.json(value); } catch (error) { return apiErrorResponse(error); } }
