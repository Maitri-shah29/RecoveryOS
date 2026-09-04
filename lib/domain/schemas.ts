import { z } from "zod";

export const operatingModeSchema = z.enum(["BENCHMARK", "RAZORPAY_PROOF"]);
export type OperatingMode = z.infer<typeof operatingModeSchema>;

export const datasetSplitSchema = z.enum(["development", "validation", "heldout"]);
export type DatasetSplit = z.infer<typeof datasetSplitSchema>;

export const failureCodeSchema = z.enum([
  "TRANSIENT",
  "INSUFFICIENT_FUNDS",
  "AUTHENTICATION_INCOMPLETE",
  "ABANDONED",
  "METHOD_UNAVAILABLE",
  "ALREADY_PAID",
  "RISK_BLOCKED",
  "UNKNOWN",
]);
export type FailureCode = z.infer<typeof failureCodeSchema>;

export const recoveryActionSchema = z.enum([
  "NO_ACTION",
  "REMINDER",
  "RETRY_INVITATION",
  "FRESH_CHECKOUT_LINK",
  "ASSISTED_REVIEW",
]);
export type RecoveryActionType = z.infer<typeof recoveryActionSchema>;

export const delayMinutesSchema = z.union([
  z.literal(0),
  z.literal(30),
  z.literal(120),
  z.literal(720),
  z.literal(1440),
]);
export type DelayMinutes = z.infer<typeof delayMinutesSchema>;

export const benchmarkCaseSchema = z.object({
  case_id: z.string().regex(/^case_[0-9]{3}$/),
  customer_id: z.string().min(1),
  order_id: z.string().min(1),
  razorpay_payment_id: z.string().nullable(),
  amount_paise: z.number().int().nonnegative(),
  currency: z.literal("INR"),
  failure_code: failureCodeSchema,
  failure_description: z.string().min(1),
  payment_method: z.enum(["CARD", "UPI", "NETBANKING", "WALLET"]),
  attempted_at: z.string().datetime({ offset: true }),
  customer_segment: z.enum(["NEW", "RETURNING", "HIGH_VALUE", "UNKNOWN"]),
  prior_attempts: z.number().int().nonnegative(),
  recovery_contacts_7d: z.number().int().nonnegative(),
  consent_status: z.enum(["OPTED_IN", "OPTED_OUT", "UNKNOWN"]),
  risk_flag: z.enum(["CLEAR", "REVIEW", "BLOCKED"]),
  preferred_channel: z.enum(["IN_APP", "EMAIL_SIMULATOR"]),
  customer_timezone: z.string().min(1),
  simulation_profile_id: z.string().min(1),
  order_paid: z.boolean(),
  action_in_flight: z.boolean(),
  required_data_complete: z.boolean(),
  split: datasetSplitSchema,
});
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;

export const datasetManifestSchema = z.object({
  dataset_version: z.string().min(1),
  generator_version: z.string().min(1),
  generated_at: z.string().datetime({ offset: true }),
  benchmark_seed_id: z.string().min(1),
  case_count: z.literal(180),
  split_counts: z.object({ development: z.literal(60), validation: z.literal(20), heldout: z.literal(100) }),
  cases: z.array(benchmarkCaseSchema).length(180),
});
export type DatasetManifest = z.infer<typeof datasetManifestSchema>;

export const frozenPlanSchema = z.object({
  case_id: z.string(),
  policy: z.enum(["NO_INTERVENTION", "REMINDER_EVERYONE", "FIXED_RULE", "RECOVERY_OS"]),
  action: recoveryActionSchema,
  delay_minutes: delayMinutesSchema,
  reason_codes: z.array(z.string()),
  policy_decision: z.enum(["APPROVED", "BLOCKED", "DEFERRED", "ESCALATED"]),
  eligible_at: z.string().datetime({ offset: true }).nullable(),
});
export type FrozenPlan = z.infer<typeof frozenPlanSchema>;

export const policyNames = ["NO_INTERVENTION", "REMINDER_EVERYONE", "FIXED_RULE", "RECOVERY_OS"] as const;
export type PolicyName = (typeof policyNames)[number];

export const aiRecommendationSchema = z.object({
  diagnosis: failureCodeSchema,
  confidence: z.number().min(0).max(1),
  recommended_action: recoveryActionSchema,
  recommended_delay_minutes: delayMinutesSchema,
  expected_recovery_probability: z.number().min(0).max(1),
  reason_codes: z.array(z.string().min(1)).min(1).max(12),
  customer_message: z.string().max(500),
  requires_human_review: z.boolean(),
}).strict();
export type AiRecommendation = z.infer<typeof aiRecommendationSchema>;

export const proofModeSelectionSchema = z.object({
  source_case_id: z.string().uuid(),
}).strict();

export const operatorReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();
