import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { apiErrorResponse } from "@/lib/http/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") ?? 25)));
    const state = url.searchParams.get("state") || undefined;
    const mode = url.searchParams.get("mode") || undefined;
    const escalation = url.searchParams.get("escalated");
    const where = {
      merchantId: SYNTHETIC_MERCHANT_ID,
      ...(state ? { recoveryState: state as never } : {}),
      ...(mode ? { mode: mode as never } : {}),
      ...(escalation === "true" ? { escalations: { some: { state: "OPEN" as const } } } : {}),
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
