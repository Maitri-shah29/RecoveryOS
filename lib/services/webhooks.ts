import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { appendCaseAudit } from "@/lib/audit/store";
import { getProofModeConfig } from "@/lib/config";
import { ApiError } from "@/lib/http/api";
import { HttpRazorpayProofClient, proofReference, type RazorpayProofClient } from "@/lib/razorpay/client";
import { sanitizedWebhookEvidence, verifyWebhookSignature, webhookPayloadSchema } from "@/lib/razorpay/webhook";

export async function processRazorpayWebhook(rawBody: string, signature: string, suppliedEventId: string | null, injectedClient?: RazorpayProofClient) {
  const proofConfig = getProofModeConfig();
  if (!proofConfig.enabled && !injectedClient) throw new ApiError(503, proofConfig.reason);
  const webhookSecret = injectedClient ? "injected-test-secret" : proofConfig.enabled ? proofConfig.webhookSecret : "";
  const eventId = suppliedEventId?.trim() || `missing_${createHash("sha256").update(rawBody).digest("hex").slice(0, 32)}`;
  const { merchant } = await ensureSyntheticMerchant(prisma);
  const existing = await prisma.webhookEvent.findUnique({ where: { merchantId_razorpayEventId: { merchantId: merchant.id, razorpayEventId: eventId } } });
  if (existing) return { status: 200, body: { accepted: existing.signatureValid, duplicate: true, processed: Boolean(existing.processedAt) } };

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    const recentInvalid = await prisma.webhookEvent.count({ where: { merchantId: merchant.id, signatureValid: false, receivedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
    await prisma.webhookEvent.create({ data: {
      merchantId: merchant.id, razorpayEventId: eventId, eventType: recentInvalid >= 2 ? "SECURITY_ALERT_THRESHOLD" : "INVALID_SIGNATURE",
      signatureValid: false, sanitizedEvidence: { ...sanitizedWebhookEvidence(rawBody), deduplicated_alert: recentInvalid >= 2 },
    } }).catch((error) => { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; });
    return { status: 401, body: { accepted: false, duplicate: false, state_changed: false } };
  }

  const payload = webhookPayloadSchema.parse(JSON.parse(rawBody));
  const paymentEntity = payload.payload.payment?.entity;
  const linkEntity = payload.payload.payment_link?.entity;
  const caseIdFromNotes = typeof paymentEntity?.notes?.recovery_case_id === "string" ? paymentEntity.notes.recovery_case_id : undefined;
  const action = await prisma.recoveryAction.findFirst({ where: {
    mode: "RAZORPAY_PROOF",
    ...(linkEntity?.id ? { externalReference: linkEntity.id } : caseIdFromNotes ? { caseId: caseIdFromNotes } : { id: "__unmatched__" }),
  }, include: { recoveryCase: true } });
  if (!action || !paymentEntity?.id) {
    await prisma.webhookEvent.create({ data: { merchantId: merchant.id, razorpayEventId: eventId, eventType: payload.event, signatureValid: true, sanitizedEvidence: sanitizedWebhookEvidence(rawBody, payload), processedAt: new Date() } });
    return { status: 202, body: { accepted: true, duplicate: false, processed: false, reason: "unmatched_proof_action" } };
  }

  const client = injectedClient ?? new HttpRazorpayProofClient(proofConfig as Extract<typeof proofConfig, { enabled: true }>);
  const payment = await client.fetchPayment(paymentEntity.id);
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.webhookEvent.findUnique({ where: { merchantId_razorpayEventId: { merchantId: merchant.id, razorpayEventId: eventId } } });
    if (duplicate) return { status: 200, body: { accepted: true, duplicate: true, processed: Boolean(duplicate.processedAt) } };
    const webhook = await tx.webhookEvent.create({ data: {
      merchantId: merchant.id, caseId: action.caseId, razorpayEventId: eventId, eventType: payload.event,
      providerPaymentId: payment.id, signatureValid: true, sanitizedEvidence: sanitizedWebhookEvidence(rawBody, payload),
    } });

    if (action.recoveryCase.paymentState === "CAPTURED" || action.recoveryCase.paymentState === "PAID") {
      await tx.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
      await appendCaseAudit(tx, action.caseId, { actorType: "RAZORPAY", eventType: "WEBHOOK_IGNORED", inputRefs: [eventId, payment.id], decision: { reason: "terminal_payment_cannot_regress", payment_state: action.recoveryCase.paymentState }, reasonCodes: ["out_of_order_terminal_event"] });
      return { status: 200, body: { accepted: true, duplicate: false, processed: true, state_changed: false } };
    }

    const expectedReference = proofReference(action.recoveryCase.externalCaseId, action.attemptNumber);
    const referenceMatches = linkEntity?.reference_id === expectedReference || payment.notes?.recovery_case_id === action.caseId;
    const truthMatches = payment.amount === action.recoveryCase.amountPaise && payment.currency === "INR" && referenceMatches;
    if (payload.event === "payment.captured" && (payment.status !== "captured" || !truthMatches)) {
      const reasonCode = "contradictory_payment_state";
      const escalation = await tx.escalation.findFirst({ where: { caseId: action.caseId, reasonCode, state: "OPEN" } }) ?? await tx.escalation.create({ data: { caseId: action.caseId, reasonCode, context: { event_status: payload.event, api_status: payment.status, amount_matches: payment.amount === action.recoveryCase.amountPaise, currency_matches: payment.currency === "INR", reference_matches: referenceMatches } } });
      await tx.recoveryCase.update({ where: { id: action.caseId }, data: { recoveryState: "ESCALATED" } });
      await tx.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
      await appendCaseAudit(tx, action.caseId, { actorType: "RAZORPAY", eventType: "ESCALATION", inputRefs: [eventId, payment.id, escalation.id], decision: { recovery_state: "ESCALATED" }, reasonCodes: [reasonCode] });
      return { status: 202, body: { accepted: true, duplicate: false, processed: true, state_changed: true, recovery_state: "ESCALATED" } };
    }

    if (payload.event === "payment.captured" && payment.status === "captured" && truthMatches) {
      const attribution = await tx.paymentAttribution.findUnique({ where: { razorpayPaymentId: payment.id } });
      if (attribution && attribution.caseId !== action.caseId) throw new ApiError(409, "Successful payment was already attributed to another case.");
      if (!attribution) await tx.paymentAttribution.create({ data: { caseId: action.caseId, razorpayPaymentId: payment.id, amountPaise: payment.amount, currency: "INR", evidence: { webhook_event_id: eventId, api_verified: true, reference: expectedReference } } });
      const attempt = await tx.paymentAttempt.findFirst({ where: { caseId: action.caseId }, orderBy: { attemptNumber: "desc" } });
      if (attempt) await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerPaymentId: payment.id, state: "CAPTURED" } });
      await tx.recoveryAction.updateMany({ where: { caseId: action.caseId, id: { not: action.id }, state: { in: ["PROPOSED", "SCHEDULED", "SENT"] } }, data: { state: "CANCELLED" } });
      await tx.recoveryAction.update({ where: { id: action.id }, data: { state: "COMPLETED", providerStatus: payment.status } });
      await tx.recoveryCase.update({ where: { id: action.caseId }, data: { paymentState: "CAPTURED", recoveryState: "RECOVERED" } });
      await tx.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
      await appendCaseAudit(tx, action.caseId, { actorType: "RAZORPAY", eventType: "PAYMENT_RECOVERED", inputRefs: [eventId, payment.id, action.id], decision: { payment_state: "CAPTURED", recovery_state: "RECOVERED", amount_paise: payment.amount, label: "Recovered — Razorpay test mode" }, reasonCodes: ["signature_verified", "api_verified", "amount_currency_reference_match"] });
      return { status: 200, body: { accepted: true, duplicate: false, processed: true, state_changed: true, recovery_state: "RECOVERED" } };
    }

    if (payload.event === "payment.authorized" && payment.status === "authorized") {
      const attempt = await tx.paymentAttempt.findFirst({ where: { caseId: action.caseId }, orderBy: { attemptNumber: "desc" } });
      if (attempt) await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerPaymentId: payment.id, state: "AUTHORIZED" } });
      await tx.recoveryCase.update({ where: { id: action.caseId }, data: { paymentState: "AUTHORIZED" } });
      await appendCaseAudit(tx, action.caseId, { actorType: "RAZORPAY", eventType: "PAYMENT_AUTHORIZED", inputRefs: [eventId, payment.id], decision: { payment_state: "AUTHORIZED", recovery_state: action.recoveryCase.recoveryState }, reasonCodes: ["signature_verified", "api_verified"] });
    }
    await tx.webhookEvent.update({ where: { id: webhook.id }, data: { processedAt: new Date() } });
    return { status: 200, body: { accepted: true, duplicate: false, processed: true, state_changed: payload.event === "payment.authorized" } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
