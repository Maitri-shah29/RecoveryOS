import { NextResponse } from "next/server";
import { SYNTHETIC_MERCHANT_ID, getProofModeConfig } from "@/lib/config";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/http/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getProofModeConfig();
    const attributions = await prisma.paymentAttribution.findMany({
      where: { recoveryCase: { merchantId: SYNTHETIC_MERCHANT_ID, mode: "RAZORPAY_PROOF" } },
      select: { amountPaise: true, caseId: true },
      orderBy: { attributedAt: "desc" },
    });
    return NextResponse.json({
      proof_mode_enabled: config.enabled,
      reason: config.enabled ? null : config.reason,
      recovered_paise: attributions.reduce((sum, item) => sum + item.amountPaise, 0),
      payment_count: attributions.length,
      latest_case_id: attributions[0]?.caseId ?? null,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
