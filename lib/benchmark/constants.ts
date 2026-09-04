import type { DelayMinutes, RecoveryActionType } from "@/lib/domain/schemas";

export const DATASET_VERSION = "recoveryos-benchmark-v1.0.0";
export const GENERATOR_VERSION = "generator-v1.0.0";
export const PLANNER_VERSION = "deterministic-planner-v1.0.0";
export const DEFAULT_BENCHMARK_SEED = "recoveryos-v1-public-seed-2026";
export const BENCHMARK_SEED_ID = "sha256:585f252c7c571cd3ea866c185abac0d2e8cd2b6831787c7e6d04edce03764f74";
export const GENERATED_AT = "2026-01-01T00:00:00.000Z";
export const VIRTUAL_NOW = "2026-01-15T12:00:00.000Z";
export const ACTIONS: RecoveryActionType[] = ["NO_ACTION", "REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK", "ASSISTED_REVIEW"];
export const DELAYS: DelayMinutes[] = [0, 30, 120, 720, 1440];
export const ACTION_COST_PAISE: Readonly<Record<RecoveryActionType, number>> = Object.freeze({
  NO_ACTION: 0,
  REMINDER: 100,
  RETRY_INVITATION: 100,
  FRESH_CHECKOUT_LINK: 200,
  ASSISTED_REVIEW: 5_000,
});
