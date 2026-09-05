import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { AuditEvent } from "@/lib/audit/chain";
import { verifyAuditChain } from "@/lib/audit/chain";
import { prisma } from "@/lib/db/prisma";
import { planBatch } from "@/lib/services/planning";
import { advanceBenchmarkClock } from "@/lib/services/benchmark-executor";
import { persistCommittedEvaluation } from "@/lib/services/evaluations";
import { createProofCase, modifyCasePlan } from "@/lib/services/case-actions";
import { approveCase } from "@/lib/services/approval";
import { processRazorpayWebhook } from "@/lib/services/webhooks";
import { proofReference, type RazorpayProofClient } from "@/lib/razorpay/client";

function record(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }

if (process.env.RECOVERYOS_DETERMINISTIC_SMOKE === "true") {
  process.env.OPENAI_API_KEY = "";
  process.env.OPENAI_MODEL = "";
}

const batch = await prisma.batch.findFirst({ where: { mode: "BENCHMARK" } });
assert(batch, "A seeded benchmark batch is required");
const existingPlanRecord = await prisma.idempotencyRecord.findFirst({
  where: { merchantId: batch.merchantId, route: `/api/batches/${batch.id}/plan` },
  orderBy: { createdAt: "desc" },
});
const planKey = existingPlanRecord?.idempotencyKey ?? `smoke-plan-${randomUUID()}`;
const planningStartedAt = performance.now();
const planned = await planBatch(batch.id, planKey);
const planningDurationMs = Math.round(performance.now() - planningStartedAt);
assert(planningDurationMs < 60_000, `Planning exceeded the 60-second requirement: ${planningDurationMs}ms`);
assert.equal(record(planned.body).planned, 180);
const replay = await planBatch(batch.id, planKey);
assert.equal(replay.replayed, true);
const unsafeActions = await prisma.recoveryAction.count({ where: { mode: "BENCHMARK", OR: [{ planId: null }, { recoveryCase: { consentStatus: { not: "OPTED_IN" } } }, { recoveryCase: { riskFlag: "BLOCKED" } }, { recoveryCase: { paymentState: { in: ["CAPTURED", "PAID"] } } }] } });
assert.equal(unsafeActions, 0);
const existingClockRecords = await prisma.idempotencyRecord.findMany({
  where: { merchantId: batch.merchantId, route: "/api/benchmark/advance" },
  orderBy: { createdAt: "desc" },
});
const existingClockRecord = existingClockRecords.find((item) => Number(record(item.response).actions_sent) > 0);
const clockKey = existingClockRecord?.idempotencyKey ?? `smoke-clock-${randomUUID()}`;
const advanced = await advanceBenchmarkClock(new Date("2026-01-18T12:00:00.000Z"), clockKey);
assert(Number(record(advanced.body).actions_sent) > 0);
const evaluation = await persistCommittedEvaluation(batch.id, `smoke-eval-${randomUUID()}`);
const evaluationId = String(record(evaluation.body).evaluation_id);
assert.equal(await prisma.evaluationOutcome.count({ where: { evaluationRunId: evaluationId } }), 400);

const source = await prisma.recoveryCase.findFirst({ where: { mode: "BENCHMARK", failureCode: "AUTHENTICATION_INCOMPLETE", consentStatus: "OPTED_IN", riskFlag: "CLEAR", amountPaise: { gte: 10_000, lt: 1_000_000 } } });
assert(source, "A safe proof source fixture is required");
const proofResult = await createProofCase(source.id, `smoke-proof-${randomUUID()}`);
const proofId = String(record(proofResult.body).case_id);
const proofBatchId = String(record(proofResult.body).batch_id);
await planBatch(proofBatchId, `smoke-proof-plan-${randomUUID()}`);
const proofBeforeApproval = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: proofId }, include: { plans: { orderBy: { createdAt: "desc" }, take: 1 } } });
assert.equal(proofBeforeApproval.recoveryState, "AWAITING_APPROVAL");
assert.equal(proofBeforeApproval.plans[0]?.proposedAction, "FRESH_CHECKOUT_LINK");
await modifyCasePlan(proofId, { action: "FRESH_CHECKOUT_LINK", delayMinutes: 0, reason: "Smoke-test operator revision" }, `smoke-modify-${randomUUID()}`);
assert.equal(await prisma.recoveryPlan.count({ where: { caseId: proofId } }), 2);

const paymentLinkId = "plink_smoke_test";
const paymentId = "pay_smoke_test";
const fakeClient: RazorpayProofClient = {
  createPaymentLink: async (input) => ({ id: paymentLinkId, short_url: "https://rzp.io/i/smoke-test", reference_id: input.referenceId, amount: input.amountPaise, currency: "INR", status: "issued", expire_by: Math.floor(input.expiresAt.getTime() / 1000) }),
  fetchPayment: async () => ({ id: paymentId, amount: proofBeforeApproval.amountPaise, currency: "INR", status: "captured", captured: true, order_id: null, notes: { recovery_case_id: proofId } }),
};
const approval = await approveCase(proofId, `smoke-approve-${randomUUID()}`, fakeClient);
assert.equal(record(approval.body).checkout_url, "https://rzp.io/i/smoke-test");
const action = await prisma.recoveryAction.findFirstOrThrow({ where: { caseId: proofId, externalReference: paymentLinkId } });
const reference = proofReference(proofBeforeApproval.externalCaseId, action.attemptNumber);
const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, amount: proofBeforeApproval.amountPaise, currency: "INR", status: "captured", notes: { recovery_case_id: proofId } } }, payment_link: { entity: { id: paymentLinkId, reference_id: reference, amount: proofBeforeApproval.amountPaise, currency: "INR" } } } });
const signature = createHmac("sha256", "injected-test-secret").update(raw).digest("hex");
const firstWebhook = await processRazorpayWebhook(raw, signature, "evt_smoke_capture", fakeClient);
const duplicateWebhook = await processRazorpayWebhook(raw, signature, "evt_smoke_capture", fakeClient);
assert.equal(record(firstWebhook.body).recovery_state, "RECOVERED");
assert.equal(record(duplicateWebhook.body).duplicate, true);
assert.equal(await prisma.paymentAttribution.count({ where: { razorpayPaymentId: paymentId } }), 1);

const lateRaw = JSON.stringify({ event: "payment.authorized", payload: { payment: { entity: { id: paymentId, notes: { recovery_case_id: proofId } } }, payment_link: { entity: { id: paymentLinkId, reference_id: reference } } } });
const lateSignature = createHmac("sha256", "injected-test-secret").update(lateRaw).digest("hex");
await processRazorpayWebhook(lateRaw, lateSignature, "evt_smoke_late_authorized", fakeClient);
const proofAfter = await prisma.recoveryCase.findUniqueOrThrow({ where: { id: proofId }, include: { auditEvents: { orderBy: { sequenceNumber: "asc" } } } });
assert.equal(proofAfter.paymentState, "CAPTURED");
assert.equal(proofAfter.recoveryState, "RECOVERED");
const auditEvents: AuditEvent[] = proofAfter.auditEvents.map((event) => ({ event_id: event.id, case_id: event.caseId, sequence_number: event.sequenceNumber, timestamp: event.timestamp.toISOString(), actor_type: event.actorType, actor_id: event.actorId, event_type: event.eventType, input_refs: event.inputRefs as string[], decision: event.decision, reason_codes: event.reasonCodes, policy_snapshot: event.policySnapshot, model_metadata: event.modelMetadata ?? null, previous_hash: event.previousHash, event_hash: event.eventHash }));
assert.deepEqual(verifyAuditChain(auditEvents), { valid: true, invalidSequence: null });

const invalid = await processRazorpayWebhook(raw, "00", "evt_smoke_invalid", fakeClient);
assert.equal(invalid.status, 401);
assert.equal((await prisma.recoveryCase.findUniqueOrThrow({ where: { id: proofId } })).recoveryState, "RECOVERED");
console.log(JSON.stringify({ planned: record(planned.body).planned, planning_duration_ms: planningDurationMs, benchmark_actions_sent: record(advanced.body).actions_sent, benchmark_exhausted: record(advanced.body).exhausted, evaluation_outcomes: 400, proof_state: "RECOVERED", plan_modification: "audited", attributions: 1, audit_events: auditEvents.length, duplicate_webhook: "ignored", late_authorized: "did_not_regress", invalid_signature: "rejected" }, null, 2));
await prisma.$disconnect();
