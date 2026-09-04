import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { apiErrorResponse, ApiError } from "@/lib/http/api";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await prisma.recoveryCase.findFirst({ where: { id, merchantId: SYNTHETIC_MERCHANT_ID }, include: {
      paymentAttempts: { orderBy: { attemptNumber: "asc" } }, plans: { orderBy: { createdAt: "desc" } }, actions: { orderBy: { createdAt: "desc" }, include: { inboxMessage: true } },
      escalations: { orderBy: { createdAt: "desc" } }, auditEvents: { orderBy: { sequenceNumber: "asc" } }, webhookEvents: { orderBy: { receivedAt: "desc" } }, attributions: true,
    } });
    if (!item) throw new ApiError(404, "Case not found.");
    return NextResponse.json(item);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
