import { describe, expect, it, vi } from "vitest";
import { planWithSafeFallback, type RecommendationClient } from "@/lib/ai/planner";
import { aiRecommendationSchema } from "@/lib/ai/schema";
import { benchmarkCase } from "./fixtures";

describe("AI planner boundary", () => {
  it("uses deterministic fallback when credentials are absent", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_MODEL", "");
    const result = await planWithSafeFallback(benchmarkCase());
    expect(result).toMatchObject({ source: "fallback_rule", attempts: 0, model: null });
    expect(aiRecommendationSchema.safeParse(result.recommendation).success).toBe(true);
    vi.unstubAllEnvs();
  });

  it("retries exactly twice and safely falls back", async () => {
    let calls = 0;
    const client: RecommendationClient = { recommend: async () => { calls += 1; throw new Error("timeout"); } };
    const result = await planWithSafeFallback(benchmarkCase(), client);
    expect(calls).toBe(2);
    expect(result).toMatchObject({ source: "fallback_rule", attempts: 2, fallbackReason: "timeout" });
  });

  it("accepts one closed-schema recommendation without retry", async () => {
    let calls = 0;
    const recommendation = { diagnosis: "TRANSIENT" as const, confidence: 0.8, recommended_action: "RETRY_INVITATION" as const, recommended_delay_minutes: 30 as const, expected_recovery_probability: 0.4, reason_codes: ["network"], customer_message: "Please try again.", requires_human_review: false };
    const client: RecommendationClient = { recommend: async () => { calls += 1; return { recommendation, model: "configured-model" }; } };
    const result = await planWithSafeFallback(benchmarkCase(), client);
    expect(calls).toBe(1);
    expect(result).toMatchObject({ source: "openai", model: "configured-model", attempts: 1, recommendation });
  });

  it("rejects unknown output fields", () => {
    expect(aiRecommendationSchema.safeParse({ diagnosis: "TRANSIENT", confidence: 0.8, recommended_action: "NO_ACTION", recommended_delay_minutes: 0, expected_recovery_probability: 0, reason_codes: ["safe"], customer_message: "", requires_human_review: false, arbitrary_tool: "charge" }).success).toBe(false);
  });
});
