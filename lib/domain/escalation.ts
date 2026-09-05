export type EscalationActionEvidence = {
  type: string;
  state: string;
  attemptNumber: number;
};

export type EscalationContextInput = {
  externalCaseId: string;
  orderId: string;
  amountPaise: number;
  failureCode: string;
  failureDescription: string;
  diagnosis: string;
  confidence: number;
  policyChecks: unknown;
  actions: readonly EscalationActionEvidence[];
  reasonCode: string;
};

export function suggestedNextSafeStep(reasonCode: string): string {
  if (reasonCode.includes("contradictory_payment_state")) return "Verify payment and order truth in Razorpay before taking any further action.";
  if (reasonCode.includes("risk") || reasonCode.includes("fraud")) return "Complete a manual risk review; do not contact the customer while the review is open.";
  if (reasonCode.includes("high_value")) return "Confirm payment truth and obtain an operator decision appropriate for the high-value threshold.";
  if (reasonCode.includes("confidence") || reasonCode.includes("human_review")) return "Review the sanitized evidence and choose a permitted action or stop the workflow.";
  if (reasonCode.includes("attempt") || reasonCode.includes("contact_cap")) return "Stop further automated contact and record the operator disposition.";
  return "Review payment truth, policy gates, and prior actions before resolving or stopping the workflow.";
}

export function buildEscalationContext(input: EscalationContextInput) {
  return {
    case_id: input.externalCaseId,
    order_id: input.orderId,
    amount_paise: input.amountPaise,
    sanitized_failure_evidence: {
      failure_code: input.failureCode,
      failure_description: input.failureDescription.slice(0, 500),
    },
    diagnosis: input.diagnosis,
    confidence: input.confidence,
    policy_checks: input.policyChecks,
    actions_already_attempted: input.actions.map((action) => ({
      type: action.type,
      state: action.state,
      attempt_number: action.attemptNumber,
    })),
    escalation_reason: input.reasonCode,
    suggested_next_safe_step: suggestedNextSafeStep(input.reasonCode),
  };
}
