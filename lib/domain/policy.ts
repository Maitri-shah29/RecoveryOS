import type { BenchmarkCase, DelayMinutes, RecoveryActionType } from "./schemas";

export const POLICY_VERSION = "policy-v1.0.0";

export type PolicyConfig = {
  maxActionsPerOrder: number;
  maxContactsPerCustomer7d: number;
  recoveryWindowHours: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  minimumAmountPaise: number;
  humanReviewConfidence: number;
  highValueReviewPaise: number;
};

export const DEFAULT_POLICY: Readonly<PolicyConfig> = Object.freeze({
  maxActionsPerOrder: 2,
  maxContactsPerCustomer7d: 3,
  recoveryWindowHours: 48,
  quietHoursStart: 21,
  quietHoursEnd: 9,
  minimumAmountPaise: 10_000,
  humanReviewConfidence: 0.65,
  highValueReviewPaise: 1_000_000,
});

export type PolicyProposal = {
  action: RecoveryActionType;
  delayMinutes: DelayMinutes;
  confidence: number;
};

export type PolicyDecision = {
  outcome: "APPROVED" | "BLOCKED" | "DEFERRED" | "ESCALATED";
  action: RecoveryActionType;
  delayMinutes: DelayMinutes;
  eligibleAt: string | null;
  reasonCodes: string[];
  gateResults: { gate: string; passed: boolean }[];
};

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function localTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  const first = new Date(guess.getTime() - timeZoneOffsetMs(guess, timeZone));
  return new Date(guess.getTime() - timeZoneOffsetMs(first, timeZone));
}

export function nextAllowedContactTime(date: Date, timeZone: string, config: PolicyConfig = DEFAULT_POLICY): Date {
  const p = zonedParts(date, timeZone);
  if (p.hour >= config.quietHoursEnd && p.hour < config.quietHoursStart) return date;
  const localDate = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (p.hour >= config.quietHoursStart) localDate.setUTCDate(localDate.getUTCDate() + 1);
  return localTimeToUtc(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate(),
    config.quietHoursEnd,
    timeZone,
  );
}

export function evaluatePolicy(
  item: BenchmarkCase,
  proposal: PolicyProposal,
  now: Date,
  config: PolicyConfig = DEFAULT_POLICY,
): PolicyDecision {
  const attemptedAt = new Date(item.attempted_at);
  const recoveryDeadline = new Date(attemptedAt.getTime() + config.recoveryWindowHours * 60 * 60 * 1000);
  const proposedAt = new Date(now.getTime() + proposal.delayMinutes * 60_000);
  const gates = [
    ["payment_not_already_paid", !item.order_paid && item.failure_code !== "ALREADY_PAID"],
    ["explicit_consent", item.consent_status === "OPTED_IN"],
    ["risk_not_blocked", item.risk_flag !== "BLOCKED" && item.failure_code !== "RISK_BLOCKED"],
    ["minimum_amount", item.amount_paise >= config.minimumAmountPaise],
    ["within_recovery_window", now <= recoveryDeadline && proposedAt <= recoveryDeadline],
    ["attempts_available", item.prior_attempts < config.maxActionsPerOrder],
    ["contact_cap_available", item.recovery_contacts_7d < config.maxContactsPerCustomer7d],
    ["no_action_in_flight", !item.action_in_flight],
    ["required_data_complete", item.required_data_complete],
  ].map(([gate, passed]) => ({ gate: String(gate), passed: Boolean(passed) }));

  if (proposal.action === "NO_ACTION") {
    return { outcome: "APPROVED", action: "NO_ACTION", delayMinutes: 0, eligibleAt: null, reasonCodes: ["policy_no_action"], gateResults: gates };
  }

  const failed = gates.filter((gate) => !gate.passed).map((gate) => gate.gate);
  if (failed.length > 0) {
    return { outcome: "BLOCKED", action: "NO_ACTION", delayMinutes: 0, eligibleAt: null, reasonCodes: failed, gateResults: gates };
  }

  if (item.risk_flag === "REVIEW" || proposal.confidence < config.humanReviewConfidence || item.amount_paise >= config.highValueReviewPaise) {
    const reasons = [
      ...(item.risk_flag === "REVIEW" ? ["risk_review"] : []),
      ...(proposal.confidence < config.humanReviewConfidence ? ["low_confidence"] : []),
      ...(item.amount_paise >= config.highValueReviewPaise ? ["high_value"] : []),
    ];
    return { outcome: "ESCALATED", action: "ASSISTED_REVIEW", delayMinutes: 0, eligibleAt: null, reasonCodes: reasons, gateResults: gates };
  }

  const allowedAt = nextAllowedContactTime(proposedAt, item.customer_timezone, config);
  if (allowedAt > recoveryDeadline) {
    return { outcome: "BLOCKED", action: "NO_ACTION", delayMinutes: 0, eligibleAt: null, reasonCodes: ["quiet_hours_past_deadline"], gateResults: gates };
  }
  if (allowedAt.getTime() !== proposedAt.getTime()) {
    const deferredMinutes = Math.round((allowedAt.getTime() - now.getTime()) / 60_000);
    const permittedDelay = ([0, 30, 120, 720, 1440] as const).reduce((closest, value) =>
      Math.abs(value - deferredMinutes) < Math.abs(closest - deferredMinutes) ? value : closest,
    );
    return { outcome: "DEFERRED", action: proposal.action, delayMinutes: permittedDelay, eligibleAt: allowedAt.toISOString(), reasonCodes: ["quiet_hours_deferred"], gateResults: gates };
  }

  return { outcome: "APPROVED", action: proposal.action, delayMinutes: proposal.delayMinutes, eligibleAt: proposedAt.toISOString(), reasonCodes: ["all_gates_passed"], gateResults: gates };
}

export type StopContext = {
  paymentCaptured: boolean;
  orderPaid: boolean;
  optedOut: boolean;
  riskBlocked: boolean;
  recoveryWindowExpired: boolean;
  attemptsExhausted: boolean;
  contactCapReached: boolean;
  operatorStopped: boolean;
  contradictoryPaymentState: boolean;
};

export function mandatoryStopReasons(context: StopContext): string[] {
  return Object.entries(context)
    .filter(([, active]) => active)
    .map(([reason]) => reason.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
}
