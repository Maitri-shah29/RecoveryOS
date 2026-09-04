import { aiRecommendationSchema } from "@/lib/domain/schemas";

export const AI_SCHEMA_VERSION = "recovery-recommendation-schema-v1.0.0";
export const PROMPT_VERSION = "recovery-planner-prompt-v1.0.0";

export const aiRecommendationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    diagnosis: { type: "string", enum: ["TRANSIENT", "INSUFFICIENT_FUNDS", "AUTHENTICATION_INCOMPLETE", "ABANDONED", "METHOD_UNAVAILABLE", "ALREADY_PAID", "RISK_BLOCKED", "UNKNOWN"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    recommended_action: { type: "string", enum: ["NO_ACTION", "REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK", "ASSISTED_REVIEW"] },
    recommended_delay_minutes: { type: "integer", enum: [0, 30, 120, 720, 1440] },
    expected_recovery_probability: { type: "number", minimum: 0, maximum: 1 },
    reason_codes: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
    customer_message: { type: "string", maxLength: 500 },
    requires_human_review: { type: "boolean" },
  },
  required: ["diagnosis", "confidence", "recommended_action", "recommended_delay_minutes", "expected_recovery_probability", "reason_codes", "customer_message", "requires_human_review"],
} as const;

export { aiRecommendationSchema };
