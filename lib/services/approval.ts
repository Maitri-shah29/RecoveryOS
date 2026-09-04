import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { appendCaseAudit } from "@/lib/audit/store";
import { getProofModeConfig } from "@/lib/config";
import { ApiError } from "@/lib/http/api";
import { recoveryCaseToPlannerInput } from "@/lib/domain/case-mapper";
import { evaluatePolicy, DEFAULT_POLICY, type PolicyConfig } from "@/lib/domain/policy";
import { actionIdempotencyKey } from "@/lib/domain/idempotency";
import { HttpRazorpayProofClient, proofReference, type RazorpayProofClient } from "@/lib/razorpay/client";

export async function approveCase(caseId: string, idempotencyKey: string, injectedClient?: RazorpayProofClient) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  return runIdempotentMutation(prisma, merchant.id, `/api/cases/${caseId}/approve`, idempotencyKey, { caseId }, async (tx) => {
    const item = await tx.recoveryCase.findFirst({ where: { id: caseId, merchantId: merchant.id }, include: { plans: { orderBy: { createdAt: "desc" }, take: 1 }, actions: { where: { state: { in: ["PROPOSED", "SCHEDULED", "SENT"] } } } } });
    if (!item) throw new ApiError(404, "Case not found.");
    if (item.mode !== "RAZORPAY_PROOF" || item.recoveryState !== "AWAITING_APPROVAL") throw new ApiError(409, "Only a proof-mode case awaiting approval can be approved.");
    const plan = item.plans[0];
    if (!plan) throw new ApiError(409, "A frozen plan is required before approval.");
    const policy = await tx.policyVersion.findUnique({ where: { id: plan.policyVersionId } });
    const config = policy?.config && typeof policy.config === "object" ? policy.config as unknown as PolicyConfig : DEFAULT_POLICY;
    const plannerInput = { ...recoveryCaseToPlannerInput(item), action_in_flight: item.actions.length > 0 };
    const decision = evaluatePolicy(plannerInput, { action: plan.proposedAction, delayMinutes: plan.delayMinutes as never, confidence: Number(plan.confidence) }, new Date(), config);
    if (decision.outcome === "BLOCKED" || decision.outcome === "ESCALATED") throw new ApiError(409, "Current policy no longer permits this action.", decision.reasonCodes);
    const attemptNumber = item.priorAttempts + 1;
    const idempotency = actionIdempotencyKey(merchant.id, item.externalCaseId, decision.action, attemptNumber);
    const scheduledFor = decision.eligibleAt ? new Date(decision.eligibleAt) : new Date();
    let externalReference: string | undefined;
    let externalUrl: string | undefined;
    let providerStatus: string | undefined;
    let actionState: "SCHEDULED" | "SENT" = "SCHEDULED";

    if (decision.action === "FRESH_CHECKOUT_LINK") {
      const linkCount = await tx.recoveryAction.count({ where: { mode: "RAZORPAY_PROOF", type: "FRESH_CHECKOUT_LINK", externalReference: { not: null } } });
      if (linkCount >= 3) throw new ApiError(409, "The V1 maximum of three Razorpay test Payment Links has been reached.");
      const proofConfig = getProofModeConfig();
      if (!proofConfig.enabled && !injectedClient) throw new ApiError(503, proofConfig.reason);
      const client = injectedClient ?? new HttpRazorpayProofClient(proofConfig as Extract<typeof proofConfig, { enabled: true }>);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const link = await client.createPaymentLink({ amountPaise: item.amountPaise, referenceId: proofReference(item.externalCaseId, attemptNumber), caseId: item.id, orderId: item.orderId, expiresAt });
      if (link.amount !== item.amountPaise || link.currency !== "INR") throw new ApiError(502, "Razorpay returned contradictory Payment Link amount or currency.");
      externalReference = link.id;
      externalUrl = link.short_url;
      providerStatus = link.status;
      actionState = "SENT";
    }
    const action = await tx.recoveryAction.create({ data: {
      caseId: item.id, planId: plan.id, policyVersionId: plan.policyVersionId, mode: "RAZORPAY_PROOF", type: decision.action,
      state: actionState, attemptNumber, idempotencyKey: idempotency, scheduledFor, externalReference, externalUrl, providerStatus,
      expiresAt: decision.action === "FRESH_CHECKOUT_LINK" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,
    } });
    if (["REMINDER", "RETRY_INVITATION"].includes(decision.action)) {
      await tx.inboxMessage.create({ data: { caseId: item.id, actionId: action.id, channel: item.preferredChannel, body: "Your payment did not complete. You can safely try again.", deliverAt: scheduledFor } });
    }
    const recoveryState = actionState === "SENT" ? "ACTION_SENT" : "ACTION_SCHEDULED";
    await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState } });
    await appendCaseAudit(tx, item.id, { actorType: "OPERATOR", eventType: "ACTION_APPROVED", inputRefs: [plan.id, action.id], decision: { action: decision.action, recovery_state: recoveryState, external_reference: externalReference ?? null, mode: "RAZORPAY_PROOF" }, reasonCodes: ["operator_approved", ...decision.reasonCodes] });
    const body: Prisma.InputJsonObject = { case_id: item.id, action_id: action.id, recovery_state: recoveryState, external_reference: externalReference ?? null, checkout_url: externalUrl ?? null };
    return { status: 201, body };
  });
}
