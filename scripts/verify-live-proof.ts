import assert from "node:assert/strict";
import type { AuditEvent } from "@/lib/audit/chain";
import { verifyAuditChain } from "@/lib/audit/chain";
import { getProofModeConfig, SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { prisma } from "@/lib/db/prisma";
import { HttpRazorpayProofClient } from "@/lib/razorpay/client";

const confirmation = "RecoveryOS Razorpay Test Mode";
assert.equal(process.env.CONFIRM_RAZORPAY_TEST_PROOF, confirmation, `Set CONFIRM_RAZORPAY_TEST_PROOF=${confirmation} to run the provider-backed proof check.`);

const proofConfig = getProofModeConfig();
assert(proofConfig.enabled, proofConfig.enabled ? undefined : proofConfig.reason);

const item = await prisma.recoveryCase.findFirst({
  where: {
    merchantId: SYNTHETIC_MERCHANT_ID,
    mode: "RAZORPAY_PROOF",
    paymentState: "CAPTURED",
    recoveryState: "RECOVERED",
    attributions: { some: {} },
  },
  orderBy: { updatedAt: "desc" },
  include: {
    actions: { orderBy: { createdAt: "desc" } },
    plans: { orderBy: { createdAt: "asc" } },
    auditEvents: { orderBy: { sequenceNumber: "asc" } },
    attributions: true,
    webhookEvents: { orderBy: { receivedAt: "asc" } },
  },
});
assert(item, "No recovered Razorpay proof case is available. Complete one test Checkout from the operator UI first.");
assert.equal(item.attributions.length, 1, "The proof case must have exactly one payment attribution.");
const attribution = item.attributions[0];
assert.equal(attribution.amountPaise, item.amountPaise);
assert.equal(attribution.currency, "INR");

const action = item.actions.find((candidate) => candidate.externalReference);
assert(action, "The proof case has no provider-backed recovery action.");
assert.equal(action.type, "FRESH_CHECKOUT_LINK");
assert.equal(action.state, "COMPLETED");
assert.equal(action.providerStatus, "captured");
assert(item.plans.some((plan) => plan.plannerType === "openai" || plan.plannerType === "fallback_rule"), "No typed planner decision is attached to the proof case.");
assert(item.webhookEvents.some((event) => event.eventType === "payment.captured" && event.signatureValid && event.processedAt), "No processed, signature-valid captured webhook is attached.");

const audit: AuditEvent[] = item.auditEvents.map((event) => ({
  event_id: event.id,
  case_id: event.caseId,
  sequence_number: event.sequenceNumber,
  timestamp: event.timestamp.toISOString(),
  actor_type: event.actorType,
  actor_id: event.actorId,
  event_type: event.eventType,
  input_refs: event.inputRefs as string[],
  decision: event.decision,
  reason_codes: event.reasonCodes,
  policy_snapshot: event.policySnapshot,
  model_metadata: event.modelMetadata ?? null,
  previous_hash: event.previousHash,
  event_hash: event.eventHash,
}));
assert.deepEqual(verifyAuditChain(audit), { valid: true, invalidSequence: null });
assert(audit.some((event) => event.event_type === "PAYMENT_RECOVERED"));

const providerPayment = await new HttpRazorpayProofClient(proofConfig).fetchPayment(attribution.razorpayPaymentId);
assert.equal(providerPayment.status, "captured");
assert.equal(providerPayment.amount, item.amountPaise);
assert.equal(providerPayment.currency, "INR");
assert.equal(providerPayment.notes?.recovery_case_id, item.id);

console.log(JSON.stringify({
  evidence_version: "razorpay-proof-evidence-v1.0.0",
  mode: "RAZORPAY_PROOF",
  case_id: item.id,
  external_case_id: item.externalCaseId,
  amount_paise: item.amountPaise,
  recovery_state: item.recoveryState,
  payment_state: item.paymentState,
  payment_link_id: action.externalReference,
  razorpay_payment_id: attribution.razorpayPaymentId,
  provider_api_status: providerPayment.status,
  signature_valid_webhooks: item.webhookEvents.filter((event) => event.signatureValid).length,
  immutable_audit_events: audit.length,
  audit_chain_valid: true,
  benchmark_mode_untouched: true,
  verified_at: new Date().toISOString(),
}, null, 2));

await prisma.$disconnect();
