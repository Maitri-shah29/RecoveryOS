import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { prisma } from "@/lib/db/prisma";

assert.equal(process.env.CONFIRM_SYNTHETIC_RESET, "RecoveryOS Synthetic Merchant", "Set CONFIRM_SYNTHETIC_RESET exactly before resetting demo data.");
const merchant = await prisma.merchant.findUnique({ where: { id: SYNTHETIC_MERCHANT_ID } });
assert.equal(merchant?.name, "RecoveryOS Synthetic Merchant", "Refusing to reset a merchant that is not the locked synthetic demo tenant.");

const removed = await prisma.$transaction(async (tx) => {
  const caseWhere = { recoveryCase: { merchantId: SYNTHETIC_MERCHANT_ID } };
  const runWhere = { evaluationRun: { merchantId: SYNTHETIC_MERCHANT_ID } };
  await tx.$executeRawUnsafe('ALTER TABLE "audit_events" DISABLE TRIGGER "audit_events_immutable"');
  const counts = {
    attributions: (await tx.paymentAttribution.deleteMany({ where: caseWhere })).count,
    webhookEvents: (await tx.webhookEvent.deleteMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID } })).count,
    inboxMessages: (await tx.inboxMessage.deleteMany({ where: caseWhere })).count,
    actions: (await tx.recoveryAction.deleteMany({ where: caseWhere })).count,
    escalations: (await tx.escalation.deleteMany({ where: caseWhere })).count,
    auditEvents: (await tx.auditEvent.deleteMany({ where: caseWhere })).count,
    evaluationOutcomes: (await tx.evaluationOutcome.deleteMany({ where: runWhere })).count,
    plans: (await tx.recoveryPlan.deleteMany({ where: caseWhere })).count,
    evaluationRuns: (await tx.evaluationRun.deleteMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID } })).count,
    paymentAttempts: (await tx.paymentAttempt.deleteMany({ where: caseWhere })).count,
    cases: (await tx.recoveryCase.deleteMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID } })).count,
    batches: (await tx.batch.deleteMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID } })).count,
    policies: (await tx.policyVersion.deleteMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID } })).count,
    idempotencyRecords: (await tx.idempotencyRecord.deleteMany({ where: { merchantId: SYNTHETIC_MERCHANT_ID } })).count,
  };
  await tx.$executeRawUnsafe('ALTER TABLE "audit_events" ENABLE TRIGGER "audit_events_immutable"');
  return counts;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 30_000, timeout: 240_000 });

console.log(JSON.stringify({ merchant_id: SYNTHETIC_MERCHANT_ID, merchant_preserved: true, removed }, null, 2));
await prisma.$disconnect();
