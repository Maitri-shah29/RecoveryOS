import { z } from "zod";
import type { ProofModeConfig } from "@/lib/config";

const paymentLinkSchema = z.object({
  id: z.string().min(1),
  short_url: z.string().url(),
  reference_id: z.string().min(1),
  amount: z.number().int().nonnegative(),
  currency: z.literal("INR"),
  status: z.string(),
  expire_by: z.number().int(),
}).passthrough();

export const razorpayPaymentSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().nonnegative(),
  currency: z.literal("INR"),
  status: z.enum(["created", "authorized", "captured", "refunded", "failed"]),
  captured: z.boolean().optional(),
  order_id: z.string().nullable().optional(),
  notes: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type RazorpayPayment = z.infer<typeof razorpayPaymentSchema>;

export interface RazorpayProofClient {
  createPaymentLink(input: { amountPaise: number; referenceId: string; caseId: string; orderId: string; expiresAt: Date }): Promise<z.infer<typeof paymentLinkSchema>>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
}

export class HttpRazorpayProofClient implements RazorpayProofClient {
  constructor(private config: Extract<ProofModeConfig, { enabled: true }>, private fetcher: typeof fetch = fetch) {}

  async createPaymentLink(input: { amountPaise: number; referenceId: string; caseId: string; orderId: string; expiresAt: Date }) {
    const response = await this.request("/v1/payment_links", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        accept_partial: false,
        description: `Recovery attempt for ${input.orderId}`,
        reference_id: input.referenceId,
        expire_by: Math.floor(input.expiresAt.getTime() / 1000),
        reminder_enable: false,
        notify: { sms: false, email: false },
        callback_url: `${this.config.appBaseUrl.replace(/\/$/, "")}/proof/callback`,
        callback_method: "get",
        notes: { recovery_case_id: input.caseId, recovery_order_id: input.orderId, mode: "RAZORPAY_PROOF" },
      }),
    });
    return paymentLinkSchema.parse(response);
  }

  async fetchPayment(paymentId: string) {
    return razorpayPaymentSchema.parse(await this.request(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: "GET" }));
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetcher(`https://api.razorpay.com${path}`, {
      ...init,
      headers: {
        authorization: `Basic ${Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof body === "object" && body && "error" in body ? "Razorpay rejected the test-mode request." : `Razorpay request failed with status ${response.status}.`;
      throw new Error(message);
    }
    return body;
  }
}

export function proofReference(externalCaseId: string, attemptNumber: number): string {
  return `ros_${externalCaseId}_${attemptNumber}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}
