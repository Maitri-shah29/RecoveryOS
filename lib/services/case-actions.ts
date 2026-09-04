import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { appendCaseAudit } from "@/lib/audit/store";
import { ApiError } from "@/lib/http/api";
import { isTerminalRecoveryState } from "@/lib/domain/state-machines";

export async function rejectCase(caseId: string, reason: string, idempotencyKey: string) {
  return mutateCase(caseId, "/reject", idempotencyKey, { reason }, async (tx, item) => {
    if (item.recoveryState !== "AWAITING_APPROVAL") throw new ApiError(409, "Only a case awaiting approval can be rejected.");
    await tx.recoveryCase.update({ where: { id: caseId }, data: { recoveryState: "ACTION_REJECTED" } });
    await appendCaseAudit(tx, caseId, { actorType: "OPERATOR", eventType: "ACTION_REJECTED", decision: { recovery_state: "ACTION_REJECTED", reason }, reasonCodes: ["operator_rejected"] });
    return { case_id: caseId, recovery_state: "ACTION_REJECTED" };
  });
}

export async function stopCase(caseId: string, reason: string, idempotencyKey: string) {
  return mutateCase(caseId, "/stop", idempotencyKey, { reason }, async (tx, item) => {
    if (isTerminalRecoveryState(item.recoveryState as never) && item.recoveryState !== "ESCALATED") throw new ApiError(409, "Case is already terminal.");
    await tx.recoveryAction.updateMany({ where: { caseId, state: { in: ["PROPOSED", "SCHEDULED", "SENT"] } }, data: { state: "CANCELLED" } });
    await tx.recoveryCase.update({ where: { id: caseId }, data: { recoveryState: "MANUALLY_STOPPED" } });
    await appendCaseAudit(tx, caseId, { actorType: "OPERATOR", eventType: "STOP", decision: { recovery_state: "MANUALLY_STOPPED", reason }, reasonCodes: ["operator_stopped"] });
    return { case_id: caseId, recovery_state: "MANUALLY_STOPPED" };
  });
}

export async function escalateCase(caseId: string, reason: string, idempotencyKey: string) {
  return mutateCase(caseId, "/escalate", idempotencyKey, { reason }, async (tx) => {
    const reasonCode = `operator:${reason.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 80)}`;
    const open = await tx.escalation.findFirst({ where: { caseId, reasonCode, state: "OPEN" } });
    const escalation = open ?? await tx.escalation.create({ data: { caseId, reasonCode, context: { operator_reason: reason } } });
    await tx.recoveryAction.updateMany({ where: { caseId, state: { in: ["PROPOSED", "SCHEDULED", "SENT"] } }, data: { state: "CANCELLED" } });
    await tx.recoveryCase.update({ where: { id: caseId }, data: { recoveryState: "ESCALATED" } });
    await appendCaseAudit(tx, caseId, { actorType: "OPERATOR", eventType: "ESCALATION", inputRefs: [escalation.id], decision: { recovery_state: "ESCALATED", reason }, reasonCodes: [reasonCode] });
    return { case_id: caseId, escalation_id: escalation.id, recovery_state: "ESCALATED" };
  });
}

async function mutateCase(
  caseId: string,
  action: string,
  idempotencyKey: string,
  requestBody: unknown,
  mutation: (tx: Prisma.TransactionClient, item: Awaited<ReturnType<typeof prisma.recoveryCase.findUniqueOrThrow>>) => Promise<Record<string, string>>,
) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  return runIdempotentMutation(prisma, merchant.id, `/api/cases/${caseId}${action}`, idempotencyKey, requestBody, async (tx) => {
    const item = await tx.recoveryCase.findFirst({ where: { id: caseId, merchantId: merchant.id } });
    if (!item) throw new ApiError(404, "Case not found.");
    const body = await mutation(tx, item);
    return { status: 200, body: body as Prisma.InputJsonObject };
  });
}

export async function createProofCase(sourceCaseId: string, idempotencyKey: string) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  return runIdempotentMutation(prisma, merchant.id, `/api/cases/${sourceCaseId}/proof`, idempotencyKey, { sourceCaseId }, async (tx) => {
    const proofCount = await tx.recoveryCase.count({ where: { merchantId: merchant.id, mode: "RAZORPAY_PROOF" } });
    if (proofCount >= 3) throw new ApiError(409, "The V1 proof-mode limit of three selected cases has been reached.");
    const source = await tx.recoveryCase.findFirst({ where: { id: sourceCaseId, merchantId: merchant.id, mode: "BENCHMARK" } });
    if (!source) throw new ApiError(404, "Benchmark source case not found.");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
    const externalId = `proof-${source.externalCaseId}-${suffix}`;
    const batch = await tx.batch.create({ data: {
      merchantId: merchant.id, externalId: `proof-batch-${suffix}`, mode: "RAZORPAY_PROOF", datasetVersion: "razorpay-proof-v1.0.0",
      datasetChecksum: "0".repeat(64), caseCount: 1,
    } });
    const attemptedAt = new Date();
    const proof = await tx.recoveryCase.create({ data: {
      merchantId: merchant.id, batchId: batch.id, externalCaseId: externalId, customerId: source.customerId,
      orderId: `${source.orderId}-proof-${suffix}`, mode: "RAZORPAY_PROOF", amountPaise: source.amountPaise,
      currency: "INR", failureCode: source.failureCode, failureDescription: source.failureDescription,
      paymentMethod: source.paymentMethod, attemptedAt, customerSegment: source.customerSegment, priorAttempts: 0,
      recoveryContacts7d: 0, consentStatus: source.consentStatus, riskFlag: source.riskFlag,
      preferredChannel: source.preferredChannel, customerTimezone: source.customerTimezone,
      paymentState: "FAILED", datasetVersion: "razorpay-proof-v1.0.0", datasetSplit: null, simulationProfileId: null,
    } });
    await tx.paymentAttempt.create({ data: { caseId: proof.id, attemptNumber: 1, amountPaise: proof.amountPaise, currency: "INR", state: "FAILED", attemptedAt } });
    await appendCaseAudit(tx, proof.id, { actorType: "OPERATOR", eventType: "PROOF_CASE_CREATED", inputRefs: [source.id], decision: { mode: "RAZORPAY_PROOF", recovery_state: "DETECTED" }, reasonCodes: ["manual_proof_selection"] });
    const body: Prisma.InputJsonObject = { case_id: proof.id, batch_id: batch.id, mode: "RAZORPAY_PROOF", recovery_state: "DETECTED" };
    return { status: 201, body };
  });
}
