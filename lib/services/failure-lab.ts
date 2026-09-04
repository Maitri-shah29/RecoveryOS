import { createHmac } from "node:crypto";
import { planWithSafeFallback, type RecommendationClient } from "@/lib/ai/planner";
import { reconcileSimulatedWebhook, type ReconciliationState } from "@/lib/razorpay/reconciliation";
import { verifyWebhookSignature } from "@/lib/razorpay/webhook";
import type { BenchmarkCase } from "@/lib/domain/schemas";

export async function runFailureLab() {
  const initial: ReconciliationState = { payment: "FAILED", recovery: "ACTION_SENT", processedEventIds: [], attributedPaymentIds: [] };
  const captured = { eventId: "evt_capture", eventType: "payment.captured" as const, paymentId: "pay_test", signatureValid: true, apiStatus: "captured" as const };
  const afterCapture = reconcileSimulatedWebhook(initial, captured);
  const afterDuplicate = reconcileSimulatedWebhook(afterCapture, captured);
  const afterLateAuthorized = reconcileSimulatedWebhook(afterDuplicate, { eventId: "evt_authorized_late", eventType: "payment.authorized", paymentId: "pay_test", signatureValid: true, apiStatus: "authorized" });
  const secret = "local-failure-lab-secret";
  const raw = JSON.stringify({ event: "payment.captured" });
  const validSignature = createHmac("sha256", secret).update(raw).digest("hex");
  const invalidSignatureRejected = !verifyWebhookSignature(raw, `${validSignature.slice(0, -1)}${validSignature.endsWith("0") ? "1" : "0"}`, secret);
  let modelCalls = 0;
  const timeoutClient: RecommendationClient = { recommend: async () => { modelCalls += 1; throw new Error("injected model timeout"); } };
  const caseFixture: BenchmarkCase = {
    case_id: "case_999", customer_id: "customer_failure_lab", order_id: "order_failure_lab", razorpay_payment_id: null,
    amount_paise: 25_000, currency: "INR", failure_code: "TRANSIENT", failure_description: "synthetic timeout fixture",
    payment_method: "UPI", attempted_at: new Date().toISOString(), customer_segment: "RETURNING", prior_attempts: 0,
    recovery_contacts_7d: 0, consent_status: "OPTED_IN", risk_flag: "CLEAR", preferred_channel: "IN_APP",
    customer_timezone: "Asia/Kolkata", simulation_profile_id: "not_exposed", order_paid: false, action_in_flight: false,
    required_data_complete: true, split: "development",
  };
  const modelResult = await planWithSafeFallback(caseFixture, timeoutClient);
  const checks = [
    { name: "duplicate_webhook", expected: "one attribution", actual: afterDuplicate.attributedPaymentIds.length === 1 ? "one attribution" : `${afterDuplicate.attributedPaymentIds.length} attributions`, passed: afterDuplicate.attributedPaymentIds.length === 1 },
    { name: "out_of_order_webhook", expected: "CAPTURED / RECOVERED", actual: `${afterLateAuthorized.payment} / ${afterLateAuthorized.recovery}`, passed: afterLateAuthorized.payment === "CAPTURED" && afterLateAuthorized.recovery === "RECOVERED" },
    { name: "invalid_signature", expected: "rejected", actual: invalidSignatureRejected ? "rejected" : "accepted", passed: invalidSignatureRejected },
    { name: "model_timeout", expected: "two attempts then fallback_rule", actual: `${modelCalls} attempts then ${modelResult.source}`, passed: modelCalls === 2 && modelResult.source === "fallback_rule" },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}
