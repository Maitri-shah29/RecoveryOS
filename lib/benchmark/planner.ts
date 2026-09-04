import type { BenchmarkCase, DelayMinutes, FrozenPlan, PolicyName, RecoveryActionType } from "@/lib/domain/schemas";
import { evaluatePolicy } from "@/lib/domain/policy";
import { VIRTUAL_NOW } from "./constants";

type Proposal = { action: RecoveryActionType; delayMinutes: DelayMinutes; confidence: number; reasons: string[] };

function recoveryOsProposal(item: BenchmarkCase): Proposal {
  switch (item.failure_code) {
    case "TRANSIENT":
      return { action: "RETRY_INVITATION", delayMinutes: 30, confidence: 0.86, reasons: ["transient_failure", "bounded_retry"] };
    case "INSUFFICIENT_FUNDS":
      return { action: "REMINDER", delayMinutes: 720, confidence: 0.76, reasons: ["insufficient_funds", "wait_before_contact"] };
    case "AUTHENTICATION_INCOMPLETE":
      return { action: "FRESH_CHECKOUT_LINK", delayMinutes: 30, confidence: 0.84, reasons: ["authentication_incomplete", "fresh_customer_authorization"] };
    case "ABANDONED":
      return { action: "REMINDER", delayMinutes: 30, confidence: 0.82, reasons: ["checkout_abandoned", "least_intrusive_action"] };
    case "METHOD_UNAVAILABLE":
      return { action: "FRESH_CHECKOUT_LINK", delayMinutes: 120, confidence: 0.79, reasons: ["method_unavailable", "offer_new_checkout"] };
    case "ALREADY_PAID":
      return { action: "NO_ACTION", delayMinutes: 0, confidence: 1, reasons: ["already_paid_stop"] };
    case "RISK_BLOCKED":
      return { action: "NO_ACTION", delayMinutes: 0, confidence: 1, reasons: ["risk_blocked_stop"] };
    case "UNKNOWN":
      return { action: "ASSISTED_REVIEW", delayMinutes: 0, confidence: 0.55, reasons: ["unknown_failure", "human_review_required"] };
  }
}

function proposalFor(policy: PolicyName, item: BenchmarkCase): Proposal {
  if (policy === "NO_INTERVENTION") return { action: "NO_ACTION", delayMinutes: 0, confidence: 1, reasons: ["baseline_no_intervention"] };
  if (policy === "REMINDER_EVERYONE") return { action: "REMINDER", delayMinutes: 0, confidence: 1, reasons: ["baseline_immediate_reminder"] };
  if (policy === "FIXED_RULE") return { action: "REMINDER", delayMinutes: 30, confidence: 1, reasons: ["baseline_fixed_30_minute_reminder"] };
  return recoveryOsProposal(item);
}

export function planCase(policy: PolicyName, item: BenchmarkCase, virtualNow = new Date(VIRTUAL_NOW)): FrozenPlan {
  const proposal = proposalFor(policy, item);
  const decision = evaluatePolicy(item, proposal, virtualNow);
  return {
    case_id: item.case_id,
    policy,
    action: decision.action,
    delay_minutes: decision.delayMinutes,
    reason_codes: [...proposal.reasons, ...decision.reasonCodes],
    policy_decision: decision.outcome,
    eligible_at: decision.eligibleAt,
  };
}

export function freezePlans(policy: PolicyName, cases: readonly BenchmarkCase[]): FrozenPlan[] {
  return cases.map((item) => planCase(policy, item));
}
