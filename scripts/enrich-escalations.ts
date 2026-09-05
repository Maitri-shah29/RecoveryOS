import { Prisma } from "@prisma/client";
import { appendCaseAudit } from "@/lib/audit/store";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { prisma } from "@/lib/db/prisma";
import { buildEscalationContext } from "@/lib/domain/escalation";

const openEscalations = await prisma.escalation.findMany({
  where: { recoveryCase: { merchantId: SYNTHETIC_MERCHANT_ID }, state: "OPEN" },
  include: {
    recoveryCase: {
      include: {
        plans: { orderBy: { createdAt: "desc" }, take: 1 },
        actions: { orderBy: { createdAt: "asc" }, select: { type: true, state: true, attemptNumber: true } },
      },
    },
  },
  orderBy: { createdAt: "asc" },
});

let enriched = 0;
for (const escalation of openEscalations) {
  const existing = jsonRecord(escalation.context);
  if (typeof existing.suggested_next_safe_step === "string" && Array.isArray(existing.actions_already_attempted)) continue;
  const item = escalation.recoveryCase;
  const plan = item.plans[0];
  const context = buildEscalationContext({
    externalCaseId: item.externalCaseId,
    orderId: item.orderId,
    amountPaise: item.amountPaise,
    failureCode: item.failureCode,
    failureDescription: item.failureDescription,
    diagnosis: plan?.diagnosis ?? item.failureCode,
    confidence: plan ? Number(plan.confidence) : 0,
    policyChecks: plan?.policyDecision ?? [],
    actions: item.actions,
    reasonCode: escalation.reasonCode,
  });
  await prisma.$transaction(async (tx) => {
    await tx.escalation.update({ where: { id: escalation.id }, data: { context: context as Prisma.InputJsonObject } });
    await appendCaseAudit(tx, item.id, {
      eventType: "ESCALATION_CONTEXT_ENRICHED",
      inputRefs: [escalation.id],
      decision: { escalation_id: escalation.id, evidence_fields_added: Object.keys(context) },
      reasonCodes: ["prd_review_packet_completed"],
    });
  });
  enriched += 1;
}

console.log(JSON.stringify({ open_escalations: openEscalations.length, enriched, already_complete: openEscalations.length - enriched }, null, 2));
await prisma.$disconnect();

function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
