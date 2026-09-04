import type { AiRecommendation, BenchmarkCase } from "@/lib/domain/schemas";

export const FALLBACK_PLANNER_VERSION = "fallback-rule-v1.0.0";

export function deterministicFallbackRecommendation(item: BenchmarkCase): AiRecommendation {
  switch (item.failure_code) {
    case "TRANSIENT":
      return recommendation(item.failure_code, 0.86, "RETRY_INVITATION", 30, 0.54, ["transient_failure", "bounded_retry"], "Your payment did not complete. You can safely try checkout again.");
    case "INSUFFICIENT_FUNDS":
      return recommendation(item.failure_code, 0.76, "REMINDER", 720, 0.25, ["insufficient_funds", "wait_before_contact"], "Your payment did not complete. You can try again when convenient.");
    case "AUTHENTICATION_INCOMPLETE":
      return recommendation(item.failure_code, 0.84, "FRESH_CHECKOUT_LINK", 30, 0.48, ["authentication_incomplete", "fresh_authorization"], "Your payment authentication was not completed. Use a fresh checkout to try again.");
    case "ABANDONED":
      return recommendation(item.failure_code, 0.82, "REMINDER", 30, 0.5, ["checkout_abandoned", "least_intrusive_action"], "Your checkout was not completed. You can return when convenient.");
    case "METHOD_UNAVAILABLE":
      return recommendation(item.failure_code, 0.79, "FRESH_CHECKOUT_LINK", 120, 0.46, ["method_unavailable", "offer_new_checkout"], "That payment method was unavailable. A fresh checkout may offer another method.");
    case "ALREADY_PAID":
      return recommendation(item.failure_code, 1, "NO_ACTION", 0, 0, ["already_paid_stop"], "");
    case "RISK_BLOCKED":
      return recommendation(item.failure_code, 1, "NO_ACTION", 0, 0, ["risk_blocked_stop"], "");
    case "UNKNOWN":
      return recommendation(item.failure_code, 0.55, "ASSISTED_REVIEW", 0, 0.08, ["unknown_failure", "human_review_required"], "", true);
  }
}

function recommendation(
  diagnosis: AiRecommendation["diagnosis"],
  confidence: number,
  recommended_action: AiRecommendation["recommended_action"],
  recommended_delay_minutes: AiRecommendation["recommended_delay_minutes"],
  expected_recovery_probability: number,
  reason_codes: string[],
  customer_message: string,
  requires_human_review = false,
): AiRecommendation {
  return { diagnosis, confidence, recommended_action, recommended_delay_minutes, expected_recovery_probability, reason_codes, customer_message, requires_human_review };
}
