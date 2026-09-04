export const recoveryStates = [
  "DETECTED",
  "INELIGIBLE_STOPPED",
  "ANALYZING",
  "POLICY_BLOCKED",
  "ESCALATED",
  "AWAITING_APPROVAL",
  "ACTION_REJECTED",
  "ACTION_APPROVED",
  "ACTION_SCHEDULED",
  "ACTION_SENT",
  "RECOVERED",
  "RETRY_ELIGIBLE",
  "EXHAUSTED",
  "EXPIRED",
  "MANUALLY_STOPPED",
] as const;

export type RecoveryState = (typeof recoveryStates)[number];

export const paymentStates = ["FAILED", "AUTHORIZED", "CAPTURED", "PAID", "CANCELLED"] as const;
export type PaymentState = (typeof paymentStates)[number];

const recoveryTransitions: Readonly<Record<RecoveryState, readonly RecoveryState[]>> = {
  DETECTED: ["INELIGIBLE_STOPPED", "ANALYZING", "RECOVERED", "MANUALLY_STOPPED"],
  INELIGIBLE_STOPPED: ["RECOVERED"],
  ANALYZING: ["POLICY_BLOCKED", "ESCALATED", "AWAITING_APPROVAL", "ACTION_APPROVED", "RECOVERED", "EXPIRED", "MANUALLY_STOPPED"],
  POLICY_BLOCKED: ["RECOVERED"],
  ESCALATED: ["RECOVERED", "MANUALLY_STOPPED"],
  AWAITING_APPROVAL: ["ACTION_REJECTED", "ACTION_APPROVED", "ESCALATED", "RECOVERED", "EXPIRED", "MANUALLY_STOPPED"],
  ACTION_REJECTED: ["MANUALLY_STOPPED", "RECOVERED"],
  ACTION_APPROVED: ["ACTION_SCHEDULED", "ACTION_SENT", "RECOVERED", "EXPIRED", "MANUALLY_STOPPED"],
  ACTION_SCHEDULED: ["ACTION_SENT", "RECOVERED", "EXPIRED", "MANUALLY_STOPPED"],
  ACTION_SENT: ["RECOVERED", "RETRY_ELIGIBLE", "EXHAUSTED", "EXPIRED", "ESCALATED", "MANUALLY_STOPPED"],
  RETRY_ELIGIBLE: ["ANALYZING", "RECOVERED", "EXHAUSTED", "EXPIRED", "MANUALLY_STOPPED"],
  RECOVERED: [],
  EXHAUSTED: ["ESCALATED", "RECOVERED"],
  EXPIRED: ["RECOVERED"],
  MANUALLY_STOPPED: ["RECOVERED"],
};

const paymentTransitions: Readonly<Record<PaymentState, readonly PaymentState[]>> = {
  FAILED: ["AUTHORIZED", "CAPTURED", "PAID", "CANCELLED"],
  AUTHORIZED: ["CAPTURED", "PAID", "CANCELLED"],
  CAPTURED: [],
  PAID: [],
  CANCELLED: [],
};

export class IllegalTransitionError extends Error {
  constructor(machine: string, from: string, to: string) {
    super(`Illegal ${machine} transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function transitionRecovery(from: RecoveryState, to: RecoveryState): RecoveryState {
  if (!recoveryTransitions[from].includes(to)) throw new IllegalTransitionError("recovery", from, to);
  return to;
}

export function transitionPayment(from: PaymentState, to: PaymentState): PaymentState {
  if (!paymentTransitions[from].includes(to)) throw new IllegalTransitionError("payment", from, to);
  return to;
}

export function forceRecoveredFromPayment(state: RecoveryState, payment: PaymentState): RecoveryState {
  return payment === "CAPTURED" || payment === "PAID" ? "RECOVERED" : state;
}

export function isTerminalRecoveryState(state: RecoveryState): boolean {
  return ["INELIGIBLE_STOPPED", "POLICY_BLOCKED", "ACTION_REJECTED", "RECOVERED", "EXHAUSTED", "EXPIRED", "MANUALLY_STOPPED"].includes(state);
}
