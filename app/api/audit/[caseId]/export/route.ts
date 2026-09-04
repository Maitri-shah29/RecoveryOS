import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { verifyAuditChain, type AuditEvent } from "@/lib/audit/chain";
import { apiErrorResponse, ApiError } from "@/lib/http/api";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await params;
    const item = await prisma.recoveryCase.findFirst({ where: { id: caseId, merchantId: SYNTHETIC_MERCHANT_ID }, select: { id: true, externalCaseId: true, mode: true } });
    if (!item) throw new ApiError(404, "Case not found.");
    const rows = await prisma.auditEvent.findMany({ where: { caseId }, orderBy: { sequenceNumber: "asc" } });
    const events: AuditEvent[] = rows.map((event) => ({
      event_id: event.id, case_id: event.caseId, sequence_number: event.sequenceNumber, timestamp: event.timestamp.toISOString(), actor_type: event.actorType,
      actor_id: event.actorId, event_type: event.eventType, input_refs: event.inputRefs as string[], decision: event.decision,
      reason_codes: event.reasonCodes, policy_snapshot: event.policySnapshot, model_metadata: event.modelMetadata ?? null,
      previous_hash: event.previousHash, event_hash: event.eventHash,
    }));
    const verification = verifyAuditChain(events);
    return NextResponse.json({ case_id: item.externalCaseId, mode: item.mode, verification, events }, { headers: { "Content-Disposition": `attachment; filename="${item.externalCaseId}-audit.json"` } });
  } catch (error) { return apiErrorResponse(error); }
}
