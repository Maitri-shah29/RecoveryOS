import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { datasetManifestSchema } from "@/lib/domain/schemas";
import { getProofModeConfig } from "@/lib/config";
import { planWithSafeFallback } from "@/lib/ai/planner";

const manifest = datasetManifestSchema.parse(JSON.parse(await readFile("fixtures/public/recovery-cases-v1.0.0.json", "utf8")));
const item = manifest.cases.find((candidate) => candidate.consent_status === "OPTED_IN" && candidate.risk_flag === "CLEAR" && !candidate.order_paid && candidate.amount_paise < 1_000_000 && candidate.prior_attempts < 2);
assert(item, "An eligible public fixture is required.");

const planner = await planWithSafeFallback(item);
assert.equal(planner.source, "openai", `OpenAI validation fell back after ${planner.attempts} attempts: ${planner.fallbackReason ?? "unknown reason"}`);

const proof = getProofModeConfig();
if (!proof.enabled) throw new Error(proof.reason);
const authorization = Buffer.from(`${proof.keyId}:${proof.keySecret}`).toString("base64");
const razorpayResponse = await fetch("https://api.razorpay.com/v1/payment_links?count=1", {
  headers: { authorization: `Basic ${authorization}` },
  signal: AbortSignal.timeout(20_000),
});
assert(razorpayResponse.ok, `Razorpay credential validation returned HTTP ${razorpayResponse.status}.`);

console.log(JSON.stringify({
  openai: { valid: true, model: planner.model, schema_version: planner.schemaVersion, prompt_version: planner.promptVersion },
  razorpay: { valid: true, test_mode: proof.keyId.startsWith("rzp_test_") },
}, null, 2));
