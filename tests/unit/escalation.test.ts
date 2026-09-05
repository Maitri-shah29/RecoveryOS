import { describe, expect, it } from "vitest";
import { buildEscalationContext, suggestedNextSafeStep } from "@/lib/domain/escalation";
import { escalationDispositionSchema } from "@/lib/domain/schemas";

describe("escalation evidence", () => {
  it("builds the complete, sanitized operator review context", () => {
    const context = buildEscalationContext({
      externalCaseId: "case_001",
      orderId: "order_001",
      amountPaise: 25_000,
      failureCode: "UNKNOWN",
      failureDescription: "x".repeat(700),
      diagnosis: "UNKNOWN",
      confidence: 0.4,
      policyChecks: [{ gate: "confidence", passed: false }],
      actions: [{ type: "REMINDER", state: "COMPLETED", attemptNumber: 1 }],
      reasonCode: "confidence_below_threshold",
    });

    expect(context.sanitized_failure_evidence.failure_description).toHaveLength(500);
    expect(context.actions_already_attempted).toEqual([{ type: "REMINDER", state: "COMPLETED", attempt_number: 1 }]);
    expect(context.suggested_next_safe_step).toContain("Review the sanitized evidence");
  });

  it("provides a payment-truth instruction for contradictory state", () => {
    expect(suggestedNextSafeStep("contradictory_payment_state")).toContain("Razorpay");
  });

  it("requires an explicit disposition and meaningful resolution", () => {
    expect(escalationDispositionSchema.safeParse({ disposition: "RESOLVED", resolution: "Verified and stopped" }).success).toBe(true);
    expect(escalationDispositionSchema.safeParse({ disposition: "RETRY", resolution: "x" }).success).toBe(false);
  });
});
