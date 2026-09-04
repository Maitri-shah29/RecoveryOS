import { createHash, createHmac } from "node:crypto";
import type { BenchmarkCase, DatasetManifest, DelayMinutes, FailureCode, RecoveryActionType } from "@/lib/domain/schemas";
import { ACTIONS, BENCHMARK_SEED_ID, DATASET_VERSION, DEFAULT_BENCHMARK_SEED, DELAYS, GENERATED_AT, GENERATOR_VERSION } from "./constants";

export type PotentialOutcome = {
  case_id: string;
  action: RecoveryActionType;
  delay_minutes: DelayMinutes;
  recovery_probability: number;
  deterministic_draw: number;
  recovered: boolean;
  recovery_delay_minutes: number | null;
};

export type EvaluatorFixture = {
  dataset_version: string;
  generator_version: string;
  seed_id: string;
  ruleset_version: string;
  outcomes: PotentialOutcome[];
};

const failureCodes: FailureCode[] = [
  "TRANSIENT", "INSUFFICIENT_FUNDS", "AUTHENTICATION_INCOMPLETE", "ABANDONED",
  "METHOD_UNAVAILABLE", "ALREADY_PAID", "RISK_BLOCKED", "UNKNOWN",
];
const timezones = ["Asia/Kolkata", "Asia/Singapore", "Europe/London", "America/New_York"];
const methods = ["CARD", "UPI", "NETBANKING", "WALLET"] as const;
const segments = ["NEW", "RETURNING", "HIGH_VALUE", "UNKNOWN"] as const;

function deterministicUnit(seed: string, value: string): number {
  const hex = createHmac("sha256", seed).update(value).digest("hex").slice(0, 13);
  return Number.parseInt(hex, 16) / 0x1fffffffffffff;
}

function caseSplit(index: number): BenchmarkCase["split"] {
  if (index < 60) return "development";
  if (index < 80) return "validation";
  return "heldout";
}

export function generatePublicDataset(seed = DEFAULT_BENCHMARK_SEED): DatasetManifest {
  const cases: BenchmarkCase[] = Array.from({ length: 180 }, (_, index) => {
    const number = index + 1;
    const failure = failureCodes[index % failureCodes.length];
    const amountBands = [7_500, 12_500, 25_000, 49_900, 99_900, 250_000, 550_000, 1_250_000];
    const amount = amountBands[(index * 5 + Math.floor(index / 8)) % amountBands.length];
    const attempted = new Date(Date.parse("2026-01-15T11:30:00.000Z") - (index % 47) * 60 * 60 * 1000);
    const consentRoll = index % 13;
    const risk = failure === "RISK_BLOCKED" ? "BLOCKED" : index % 17 === 0 ? "REVIEW" : "CLEAR";
    const alreadyPaid = failure === "ALREADY_PAID";
    return {
      case_id: `case_${String(number).padStart(3, "0")}`,
      customer_id: `customer_${String((index % 72) + 1).padStart(3, "0")}`,
      order_id: `order_${String(number).padStart(3, "0")}`,
      razorpay_payment_id: null,
      amount_paise: amount,
      currency: "INR" as const,
      failure_code: failure,
      failure_description: `${failure.toLowerCase().replaceAll("_", " ")} during synthetic checkout`,
      payment_method: methods[index % methods.length],
      attempted_at: attempted.toISOString(),
      customer_segment: amount >= 1_000_000 ? "HIGH_VALUE" : segments[index % segments.length],
      prior_attempts: index % 19 === 0 ? 2 : index % 3,
      recovery_contacts_7d: index % 23 === 0 ? 3 : index % 3,
      consent_status: consentRoll === 0 ? "OPTED_OUT" : consentRoll === 1 ? "UNKNOWN" : "OPTED_IN",
      risk_flag: risk,
      preferred_channel: index % 2 === 0 ? "IN_APP" : "EMAIL_SIMULATOR",
      customer_timezone: timezones[index % timezones.length],
      simulation_profile_id: `profile_${createHash("sha256").update(`${seed}|${number}`).digest("hex").slice(0, 12)}`,
      order_paid: alreadyPaid,
      action_in_flight: index % 29 === 0,
      required_data_complete: index % 31 !== 0,
      split: caseSplit(index),
    };
  });
  return {
    dataset_version: DATASET_VERSION,
    generator_version: GENERATOR_VERSION,
    generated_at: GENERATED_AT,
    benchmark_seed_id: seed === DEFAULT_BENCHMARK_SEED ? BENCHMARK_SEED_ID : `sha256:${createHash("sha256").update(seed).digest("hex")}`,
    case_count: 180,
    split_counts: { development: 60, validation: 20, heldout: 100 },
    cases,
  };
}

const baseProbability: Record<FailureCode, number> = {
  TRANSIENT: 0.2,
  INSUFFICIENT_FUNDS: 0.08,
  AUTHENTICATION_INCOMPLETE: 0.12,
  ABANDONED: 0.1,
  METHOD_UNAVAILABLE: 0.08,
  ALREADY_PAID: 0,
  RISK_BLOCKED: 0,
  UNKNOWN: 0.04,
};

const effects: Record<FailureCode, Partial<Record<RecoveryActionType, number>>> = {
  TRANSIENT: { RETRY_INVITATION: 0.34, FRESH_CHECKOUT_LINK: 0.18, REMINDER: 0.12 },
  INSUFFICIENT_FUNDS: { REMINDER: 0.17, RETRY_INVITATION: 0.1, FRESH_CHECKOUT_LINK: 0.05 },
  AUTHENTICATION_INCOMPLETE: { FRESH_CHECKOUT_LINK: 0.34, REMINDER: 0.2, RETRY_INVITATION: 0.1 },
  ABANDONED: { REMINDER: 0.35, FRESH_CHECKOUT_LINK: 0.24, RETRY_INVITATION: 0.08 },
  METHOD_UNAVAILABLE: { FRESH_CHECKOUT_LINK: 0.38, RETRY_INVITATION: 0.18, REMINDER: 0.04 },
  ALREADY_PAID: {},
  RISK_BLOCKED: {},
  UNKNOWN: { ASSISTED_REVIEW: 0.2, FRESH_CHECKOUT_LINK: 0.05, REMINDER: -0.02 },
};

export function publishedRecoveryProbability(item: BenchmarkCase, action: RecoveryActionType, delay: DelayMinutes): number {
  if (item.order_paid || item.risk_flag === "BLOCKED" || item.consent_status !== "OPTED_IN") return action === "NO_ACTION" ? baseProbability[item.failure_code] : 0;
  let probability = baseProbability[item.failure_code] + (effects[item.failure_code][action] ?? 0);
  if (action === "NO_ACTION") probability = baseProbability[item.failure_code];
  if (item.customer_segment === "RETURNING" && action !== "NO_ACTION") probability += 0.04;
  if (item.prior_attempts >= 2 && action !== "NO_ACTION") probability -= 0.12;
  const delayEffect: Record<DelayMinutes, number> = { 0: -0.03, 30: 0.05, 120: 0.02, 720: 0.03, 1440: -0.08 };
  if (action !== "NO_ACTION" && action !== "ASSISTED_REVIEW") probability += delayEffect[delay];
  if (action === "ASSISTED_REVIEW") probability = item.risk_flag === "REVIEW" || item.amount_paise >= 1_000_000 ? 0.3 : 0.08;
  return Math.max(0, Math.min(0.9, Number(probability.toFixed(4))));
}

export function generateEvaluatorFixture(dataset: DatasetManifest, seed = DEFAULT_BENCHMARK_SEED): EvaluatorFixture {
  const outcomes = dataset.cases.flatMap((item) => ACTIONS.flatMap((action) => DELAYS.map((delay) => {
    const probability = publishedRecoveryProbability(item, action, delay);
    const draw = deterministicUnit(seed, `${item.case_id}|${action}|${delay}`);
    const recovered = draw < probability;
    const timingDraw = deterministicUnit(seed, `${item.case_id}|${action}|${delay}|timing`);
    const recoveryDelay = recovered ? Math.min(2_879, delay + 5 + Math.floor(timingDraw * Math.max(30, 2_880 - delay))) : null;
    return {
      case_id: item.case_id,
      action,
      delay_minutes: delay,
      recovery_probability: probability,
      deterministic_draw: Number(draw.toFixed(8)),
      recovered,
      recovery_delay_minutes: recoveryDelay,
    };
  })));
  return {
    dataset_version: dataset.dataset_version,
    generator_version: dataset.generator_version,
    seed_id: dataset.benchmark_seed_id,
    ruleset_version: "potential-outcomes-v1.0.0",
    outcomes,
  };
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function checksum(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
