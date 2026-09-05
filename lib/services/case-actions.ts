import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { appendCaseAudit } from "@/lib/audit/store";
import { ApiError } from "@/lib/http/api";
import { isTerminalRecoveryState } from "@/lib/domain/state-machines";
import { recoveryCaseToPlannerInput } from "@/lib/domain/case-mapper";
import { DEFAULT_POLICY, evaluatePolicy, type PolicyConfig } from "@/lib/domain/policy";
import type { DelayMinutes, RecoveryActionType } from "@/lib/domain/schemas";

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
    await tx.escalation.updateMany({ where: { caseId, state: "OPEN" }, data: { state: "RESOLVED", resolution: reason, resolvedAt: new Date() } });
    await tx.recoveryCase.update({ where: { id: caseId }, data: { recoveryState: "MANUALLY_STOPPED" } });
    await appendCaseAudit(tx, caseId, { actorType: "OPERATOR", eventType: "STOP", decision: { recovery_state: "MANUALLY_STOPPED", reason }, reasonCodes: ["operator_stopped"] });
    return { case_id: caseId, recovery_state: "MANUALLY_STOPPED" };
  });
}

export async function escalateCase(caseId: string, reason: string, idempotencyKey: string) {
  return mutateCase(caseId, "/escalate", idempotencyKey, { reason }, async (tx, item) => {
    if (!["ANALYZING", "AWAITING_APPROVAL", "ACTION_SENT", "EXHAUSTED", "ESCALATED"].includes(item.recoveryState)) {
      throw new ApiError(409, "The case cannot be escalated from its current state.");
    }
    const reasonCode = `operator:${reason.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 80)}`;
    const open = await tx.escalation.findFirst({ where: { caseId, reasonCode, state: "OPEN" } });
    const escalation = open ?? await tx.escalation.create({ data: { caseId, reasonCode, context: { operator_reason: reason } } });
    await tx.recoveryAction.updateMany({ where: { caseId, state: { in: ["PROPOSED", "SCHEDULED", "SENT"] } }, data: { state: "CANCELLED" } });
    await tx.recoveryCase.update({ where: { id: caseId }, data: { recoveryState: "ESCALATED" } });
    await appendCaseAudit(tx, caseId, { actorType: "OPERATOR", eventType: "ESCALATION", inputRefs: [escalation.id], decision: { recovery_state: "ESCALATED", reason }, reasonCodes: [reasonCode] });
    return { case_id: caseId, escalation_id: escalation.id, recovery_state: "ESCALATED" };
  });
}

export async function modifyCasePlan(
  caseId: string,
  input: { action: RecoveryActionType; delayMinutes: DelayMinutes; reason: string },
  idempotencyKey: string,
) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  const route = `/api/cases/${caseId}/modify`;
  const requestBody = { action: input.action, delay_minutes: input.delayMinutes, reason: input.reason };
  return runIdempotentMutation(prisma, merchant.id, route, idempotencyKey, requestBody, async (tx) => {
    const item = await tx.recoveryCase.findFirst({
      where: { id: caseId, merchantId: merchant.id },
      include: {
        plans: { orderBy: { createdAt: "desc" }, take: 1 },
        actions: { where: { state: { in: ["PROPOSED", "SCHEDULED", "SENT"] } }, select: { id: true } },
      },
    });
    if (!item) throw new ApiError(404, "Case not found.");
    if (item.mode !== "RAZORPAY_PROOF" || item.recoveryState !== "AWAITING_APPROVAL") {
      throw new ApiError(409, "Only a proof-mode case awaiting approval can be modified.");
    }
    if (!["REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK"].includes(input.action)) {
      throw new ApiError(422, "Proof-mode modifications must remain a customer-authorized retry action.");
    }
    if (item.actions.length > 0) throw new ApiError(409, "An action is already active for this case.");
    const previousPlan = item.plans[0];
    if (!previousPlan) throw new ApiError(409, "A frozen plan is required before modification.");
    const policy = await tx.policyVersion.findUnique({ where: { id: previousPlan.policyVersionId } });
    const config = policy?.config && typeof policy.config === "object" ? policy.config as unknown as PolicyConfig : DEFAULT_POLICY;
    const decision = evaluatePolicy(
      recoveryCaseToPlannerInput(item),
      { action: input.action, delayMinutes: input.delayMinutes, confidence: Number(previousPlan.confidence) },
      new Date(),
      config,
    );
    if (decision.outcome === "BLOCKED" || decision.outcome === "ESCALATED") {
      throw new ApiError(409, "The modified action does not pass the current policy.", decision.reasonCodes);
    }
    const plan = await tx.recoveryPlan.create({
      data: {
        caseId: item.id,
        policyVersionId: previousPlan.policyVersionId,
        plannerVersion: `operator-modification-v1:${previousPlan.id}`,
        plannerType: "operator",
        diagnosis: previousPlan.diagnosis,
        confidence: previousPlan.confidence,
        proposedAction: decision.action,
        delayMinutes: decision.delayMinutes,
        reasonCodes: ["operator_modified", ...decision.reasonCodes],
        policyDecision: decision as unknown as Prisma.InputJsonObject,
        frozenAt: new Date(),
      },
    });
    await appendCaseAudit(tx, item.id, {
      eventType: "POLICY_CHECK",
      inputRefs: [plan.id],
      decision: decision as unknown as Prisma.InputJsonObject,
      reasonCodes: decision.reasonCodes,
    });
    await appendCaseAudit(tx, item.id, {
      actorType: "OPERATOR",
      eventType: "ACTION_MODIFIED",
      inputRefs: [previousPlan.id, plan.id],
      decision: {
        previous_action: previousPlan.proposedAction,
        action: decision.action,
        delay_minutes: decision.delayMinutes,
        recovery_state: "AWAITING_APPROVAL",
        reason: input.reason,
      },
      reasonCodes: ["operator_modified", ...decision.reasonCodes],
    });
    const body: Prisma.InputJsonObject = {
      case_id: item.id,
      plan_id: plan.id,
      recovery_state: "AWAITING_APPROVAL",
      proposed_action: decision.action,
      delay_minutes: decision.delayMinutes,
    };
    return { status: 201, body };
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
