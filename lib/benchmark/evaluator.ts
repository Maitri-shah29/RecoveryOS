import type { BenchmarkCase, FrozenPlan, PolicyName, RecoveryActionType } from "@/lib/domain/schemas";
import { ACTION_COST_PAISE, PLANNER_VERSION } from "./constants";
import { checksum, type EvaluatorFixture } from "./generator";
import { POLICY_VERSION } from "@/lib/domain/policy";

export type FrozenPolicyPlans = {
  policy: PolicyName;
  dataset_checksum: string;
  planner_version: string;
  plan_checksum: string;
  plans: FrozenPlan[];
};

export type PolicyMetrics = {
  policy: PolicyName;
  dataset_checksum: string;
  cases: number;
  revenue_at_risk_paise: number;
  recovered_cases: number;
  gross_recovered_paise: number;
  assumed_cost_paise: number;
  net_recovered_paise: number;
  incremental_net_vs_fixed_paise: number;
  contacts: number;
  escalations: number;
  blocked_cases: number;
  unresolved_cases: number;
  unauthorized_contacts: number;
  duplicate_external_actions: number;
  successful_payment_double_attributions: number;
  sensitivity: { multiplier: number; cost_paise: number; net_recovered_paise: number }[];
  recovery_curve: { elapsed_minutes: number; recovered_cases: number; gross_recovered_paise: number }[];
  recovery_by_failure: { failure_code: string; cases: number; recovered_cases: number; gross_recovered_paise: number }[];
  recovery_by_action: { action: RecoveryActionType; cases: number; recovered_cases: number; gross_recovered_paise: number; assumed_cost_paise: number; net_recovered_paise: number }[];
};

export type BenchmarkReport = {
  report_version: string;
  dataset_version: string;
  dataset_checksum: string;
  policy_version: string;
  planner_version: string;
  seed_id: string;
  mode: "BENCHMARK";
  money_label: "Recovered — simulation";
  cost_assumption_label: string;
  heldout_case_count: number;
  all_cases_accounted_for: boolean;
  identical_dataset_checksum_for_all_policies: boolean;
  policies: PolicyMetrics[];
  unresolved_exceptions: { policy: PolicyName; case_ids: string[] }[];
};

const contactActions: RecoveryActionType[] = ["REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK"];

export function evaluateFrozenPlans(
  datasetVersion: string,
  datasetChecksum: string,
  cases: readonly BenchmarkCase[],
  planSets: readonly FrozenPolicyPlans[],
  fixture: EvaluatorFixture,
): BenchmarkReport {
  if (fixture.dataset_version !== datasetVersion) throw new Error("Evaluator fixture dataset version mismatch");
  if (planSets.some((set) => set.dataset_checksum !== datasetChecksum)) throw new Error("Policies did not use the identical held-out checksum");

  const caseById = new Map(cases.map((item) => [item.case_id, item]));
  const outcomeByKey = new Map(fixture.outcomes.map((outcome) => [`${outcome.case_id}|${outcome.action}|${outcome.delay_minutes}`, outcome]));
  const unresolved: BenchmarkReport["unresolved_exceptions"] = [];

  const initialMetrics = planSets.map((planSet): PolicyMetrics => {
    if (planSet.plans.length !== cases.length || checksum(planSet.plans) !== planSet.plan_checksum) throw new Error(`Frozen plan integrity failed for ${planSet.policy}`);
    const seen = new Set<string>();
    let gross = 0;
    let recoveredCases = 0;
    let cost = 0;
    let contacts = 0;
    let escalations = 0;
    let blocked = 0;
    let unauthorized = 0;
    const exceptionIds: string[] = [];
    const recoveredEvents: { elapsedMinutes: number; amountPaise: number }[] = [];
    const byFailure = new Map<string, { cases: number; recoveredCases: number; grossRecoveredPaise: number }>();
    const byAction = new Map<RecoveryActionType, { cases: number; recoveredCases: number; grossRecoveredPaise: number; assumedCostPaise: number }>();

    for (const plan of planSet.plans) {
      if (seen.has(plan.case_id)) throw new Error(`Duplicate plan for ${plan.case_id}`);
      seen.add(plan.case_id);
      const item = caseById.get(plan.case_id);
      if (!item) throw new Error(`Plan references unknown case ${plan.case_id}`);
      const outcome = outcomeByKey.get(`${plan.case_id}|${plan.action}|${plan.delay_minutes}`);
      if (!outcome) throw new Error(`Missing potential outcome for ${plan.case_id}`);
      const isContact = contactActions.includes(plan.action);
      const failureMetric = byFailure.get(item.failure_code) ?? { cases: 0, recoveredCases: 0, grossRecoveredPaise: 0 };
      failureMetric.cases += 1;
      byFailure.set(item.failure_code, failureMetric);
      const actionMetric = byAction.get(plan.action) ?? { cases: 0, recoveredCases: 0, grossRecoveredPaise: 0, assumedCostPaise: 0 };
      actionMetric.cases += 1;
      actionMetric.assumedCostPaise += ACTION_COST_PAISE[plan.action];
      byAction.set(plan.action, actionMetric);
      if (isContact) {
        contacts += 1;
        if (item.consent_status !== "OPTED_IN" || item.risk_flag === "BLOCKED" || item.order_paid || item.prior_attempts >= 2) unauthorized += 1;
      }
      if (plan.action === "ASSISTED_REVIEW") {
        escalations += 1;
        exceptionIds.push(plan.case_id);
      }
      if (plan.policy_decision === "BLOCKED") blocked += 1;
      cost += ACTION_COST_PAISE[plan.action];
      if (outcome.recovered && outcome.recovery_delay_minutes !== null && outcome.recovery_delay_minutes < 2_880) {
        gross += item.amount_paise;
        recoveredCases += 1;
        recoveredEvents.push({ elapsedMinutes: outcome.recovery_delay_minutes, amountPaise: item.amount_paise });
        failureMetric.recoveredCases += 1;
        failureMetric.grossRecoveredPaise += item.amount_paise;
        actionMetric.recoveredCases += 1;
        actionMetric.grossRecoveredPaise += item.amount_paise;
      }
    }
    unresolved.push({ policy: planSet.policy, case_ids: exceptionIds });
    return {
      policy: planSet.policy,
      dataset_checksum: datasetChecksum,
      cases: cases.length,
      revenue_at_risk_paise: cases.reduce((sum, item) => sum + item.amount_paise, 0),
      recovered_cases: recoveredCases,
      gross_recovered_paise: gross,
      assumed_cost_paise: cost,
      net_recovered_paise: gross - cost,
      incremental_net_vs_fixed_paise: 0,
      contacts,
      escalations,
      blocked_cases: blocked,
      unresolved_cases: exceptionIds.length,
      unauthorized_contacts: unauthorized,
      duplicate_external_actions: 0,
      successful_payment_double_attributions: 0,
      sensitivity: [0.5, 1, 2].map((multiplier) => ({ multiplier, cost_paise: Math.round(cost * multiplier), net_recovered_paise: gross - Math.round(cost * multiplier) })),
      recovery_curve: [0, 120, 720, 1_440, 2_880].map((elapsedMinutes) => {
        const recovered = recoveredEvents.filter((event) => event.elapsedMinutes <= elapsedMinutes);
        return { elapsed_minutes: elapsedMinutes, recovered_cases: recovered.length, gross_recovered_paise: recovered.reduce((sum, event) => sum + event.amountPaise, 0) };
      }),
      recovery_by_failure: [...byFailure.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([failureCode, value]) => ({
        failure_code: failureCode,
        cases: value.cases,
        recovered_cases: value.recoveredCases,
        gross_recovered_paise: value.grossRecoveredPaise,
      })),
      recovery_by_action: [...byAction.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([action, value]) => ({
        action,
        cases: value.cases,
        recovered_cases: value.recoveredCases,
        gross_recovered_paise: value.grossRecoveredPaise,
        assumed_cost_paise: value.assumedCostPaise,
        net_recovered_paise: value.grossRecoveredPaise - value.assumedCostPaise,
      })),
    };
  });
  const fixedNet = initialMetrics.find((metric) => metric.policy === "FIXED_RULE")?.net_recovered_paise;
  if (fixedNet === undefined) throw new Error("Fixed-rule baseline is required");
  const metrics = initialMetrics.map((metric) => ({ ...metric, incremental_net_vs_fixed_paise: metric.net_recovered_paise - fixedNet }));
  return {
    report_version: "benchmark-report-v1.0.0",
    dataset_version: datasetVersion,
    dataset_checksum: datasetChecksum,
    policy_version: POLICY_VERSION,
    planner_version: PLANNER_VERSION,
    seed_id: fixture.seed_id,
    mode: "BENCHMARK",
    money_label: "Recovered — simulation",
    cost_assumption_label: "Illustrative operational costs; not empirically validated",
    heldout_case_count: cases.length,
    all_cases_accounted_for: metrics.every((metric) => metric.cases === cases.length),
    identical_dataset_checksum_for_all_policies: new Set(metrics.map((metric) => metric.dataset_checksum)).size === 1,
    policies: metrics,
    unresolved_exceptions: unresolved,
  };
}
