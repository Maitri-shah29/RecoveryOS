export const SYNTHETIC_MERCHANT_ID = "00000000-0000-4000-8000-000000000001";

export type ProofModeConfig =
  | { enabled: true; keyId: string; keySecret: string; webhookSecret: string; appBaseUrl: string }
  | { enabled: false; reason: string };

export function getProofModeConfig(): ProofModeConfig {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  const appBaseUrl = process.env.APP_BASE_URL?.trim();
  if (!keyId || !keySecret || !webhookSecret || !appBaseUrl) return { enabled: false, reason: "Razorpay test credentials and APP_BASE_URL are required." };
  if (!keyId.startsWith("rzp_test_")) return { enabled: false, reason: "Only Razorpay test-mode key IDs are accepted." };
  try {
    const url = new URL(appBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("invalid protocol");
  } catch {
    return { enabled: false, reason: "APP_BASE_URL must be an absolute HTTP(S) URL." };
  }
  return { enabled: true, keyId, keySecret, webhookSecret, appBaseUrl };
}

export function getAiConfig(): { enabled: true; apiKey: string; model: string } | { enabled: false; reason: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) return { enabled: false, reason: "OPENAI_API_KEY and OPENAI_MODEL are required for AI planning." };
  return { enabled: true, apiKey, model };
}
