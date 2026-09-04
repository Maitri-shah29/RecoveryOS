import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getProofModeConfig } from "@/lib/config";
import { HttpRazorpayProofClient, proofReference } from "@/lib/razorpay/client";
import { reconcileSimulatedWebhook, type ReconciliationState } from "@/lib/razorpay/reconciliation";
import { verifyWebhookSignature } from "@/lib/razorpay/webhook";

describe("Razorpay proof safety", () => {
  it("fails closed for missing or live credentials", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", ""); expect(getProofModeConfig().enabled).toBe(false);
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_forbidden"); vi.stubEnv("RAZORPAY_KEY_SECRET", "secret"); vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook"); vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    expect(getProofModeConfig()).toMatchObject({ enabled: false, reason: "Only Razorpay test-mode key IDs are accepted." });
    vi.unstubAllEnvs();
  });

  it("creates a customer-authorized link with notifications and partial payment disabled", async () => {
    let sent: Record<string, unknown> = {};
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ id: "plink_test", short_url: "https://rzp.io/i/test", reference_id: "ros_case_1", amount: 25000, currency: "INR", status: "issued", expire_by: 2_000_000_000 }), { status: 200, headers: { "content-type": "application/json" } }); };
    const client = new HttpRazorpayProofClient({ enabled: true, keyId: "rzp_test_id", keySecret: "secret", webhookSecret: "webhook", appBaseUrl: "http://localhost:3000" }, fetcher as typeof fetch);
    await client.createPaymentLink({ amountPaise: 25_000, referenceId: "ros_case_1", caseId: "case-db-id", orderId: "order-1", expiresAt: new Date(2_000_000_000_000) });
    expect(sent).toMatchObject({ amount: 25_000, currency: "INR", accept_partial: false, reminder_enable: false, notify: { sms: false, email: false }, callback_method: "get" });
  });

  it("validates only the exact raw-body HMAC", () => {
    const raw = '{"event":"payment.captured"}'; const secret = "secret"; const signature = createHmac("sha256", secret).update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(`${raw} `, signature, secret)).toBe(false);
  });

  it("deduplicates captured events and ignores a late authorization", () => {
    const initial: ReconciliationState = { payment: "FAILED", recovery: "ACTION_SENT", processedEventIds: [], attributedPaymentIds: [] };
    const captured = { eventId: "evt_1", eventType: "payment.captured" as const, paymentId: "pay_1", signatureValid: true, apiStatus: "captured" as const };
    const once = reconcileSimulatedWebhook(initial, captured); const twice = reconcileSimulatedWebhook(once, captured);
    const late = reconcileSimulatedWebhook(twice, { eventId: "evt_2", eventType: "payment.authorized", paymentId: "pay_1", signatureValid: true, apiStatus: "authorized" });
    expect(late).toMatchObject({ payment: "CAPTURED", recovery: "RECOVERED", attributedPaymentIds: ["pay_1"] });
    expect(late.processedEventIds).toEqual(["evt_1", "evt_2"]);
  });

  it("keeps reference IDs bounded", () => { expect(proofReference("case-with-a-very-long-identifier-that-keeps-going", 2).length).toBeLessThanOrEqual(40); });
});
