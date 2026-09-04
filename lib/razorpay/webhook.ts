import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const entitySchema = z.object({
  id: z.string(),
  amount: z.number().int().optional(),
  amount_paid: z.number().int().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  reference_id: z.string().optional(),
  notes: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const webhookPayloadSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({ entity: entitySchema }).optional(),
    payment_link: z.object({ entity: entitySchema }).optional(),
  }).passthrough(),
}).passthrough();

export type RazorpayWebhookPayload = z.infer<typeof webhookPayloadSchema>;

export function verifyWebhookSignature(rawBody: string, receivedSignature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let received: Buffer;
  try { received = Buffer.from(receivedSignature, "hex"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function sanitizedWebhookEvidence(rawBody: string, payload?: RazorpayWebhookPayload) {
  return {
    raw_body_sha256: createHash("sha256").update(rawBody).digest("hex"),
    event: payload?.event ?? "unparsed",
    payment_id: payload?.payload.payment?.entity.id ?? null,
    payment_link_id: payload?.payload.payment_link?.entity.id ?? null,
  };
}
