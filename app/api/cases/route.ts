import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { apiErrorResponse } from "@/lib/http/api";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") ?? 25)));
    const state = url.searchParams.get("state") || undefined;
    const mode = url.searchParams.get("mode") || undefined;
    const escalation = url.searchParams.get("escalated");
    const diagnosis = url.searchParams.get("diagnosis") || undefined;
    const action = url.searchParams.get("action") || undefined;
    const confidenceMin = url.searchParams.has("confidence_min") ? Number(url.searchParams.get("confidence_min")) : undefined;
    const confidenceMax = url.searchParams.has("confidence_max") ? Number(url.searchParams.get("confidence_max")) : undefined;
    const confidence = {
      ...(Number.isFinite(confidenceMin) ? { gte: confidenceMin } : {}),
      ...(Number.isFinite(confidenceMax) ? { lte: confidenceMax } : {}),
    };
    const planFilter: Prisma.RecoveryPlanWhereInput = {
      ...(diagnosis ? { diagnosis } : {}),
      ...(action ? { proposedAction: action as never } : {}),
      ...(Object.keys(confidence).length ? { confidence } : {}),
    };
    const where: Prisma.RecoveryCaseWhereInput = {
      merchantId: SYNTHETIC_MERCHANT_ID,
      ...(state ? { recoveryState: state as never } : {}),
      ...(mode ? { mode: mode as never } : {}),
      ...(escalation === "true" ? { escalations: { some: { state: "OPEN" as const } } } : {}),
      ...(escalation === "false" ? { escalations: { none: { state: "OPEN" as const } } } : {}),
      ...(Object.keys(planFilter).length ? { plans: { some: planFilter } } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.recoveryCase.count({ where }),
      prisma.recoveryCase.findMany({ where, orderBy: [{ recoveryState: "asc" }, { externalCaseId: "asc" }], skip: (page - 1) * pageSize, take: pageSize, include: { plans: { orderBy: { createdAt: "desc" }, take: 1 }, escalations: { where: { state: "OPEN" } }, actions: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    ]);
    return NextResponse.json({ page, page_size: pageSize, total, items });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
