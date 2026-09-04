import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, evaluatePolicy, mandatoryStopReasons, nextAllowedContactTime } from "@/lib/domain/policy";
import { benchmarkCase } from "./fixtures";

const proposal = { action: "REMINDER" as const, delayMinutes: 0 as const, confidence: 0.9 };

describe("deterministic policy gates", () => {
  it.each([
    [{ order_paid: true }, "payment_not_already_paid"],
    [{ consent_status: "OPTED_OUT" as const }, "explicit_consent"],
    [{ consent_status: "UNKNOWN" as const }, "explicit_consent"],
    [{ risk_flag: "BLOCKED" as const }, "risk_not_blocked"],
    [{ amount_paise: 9_999 }, "minimum_amount"],
    [{ prior_attempts: 2 }, "attempts_available"],
    [{ recovery_contacts_7d: 3 }, "contact_cap_available"],
    [{ action_in_flight: true }, "no_action_in_flight"],
    [{ required_data_complete: false }, "required_data_complete"],
  ])("blocks an ineligible case: %s", (overrides, reason) => {
    const decision = evaluatePolicy(benchmarkCase(overrides), proposal, new Date("2026-01-15T17:00:00.000Z"));
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.action).toBe("NO_ACTION");
    expect(decision.reasonCodes).toContain(reason);
  });

  it("defers a quiet-hours contact to 9 AM customer local time", () => {
    const now = new Date("2026-01-15T17:00:00.000Z");
    expect(nextAllowedContactTime(now, "Asia/Kolkata").toISOString()).toBe("2026-01-16T03:30:00.000Z");
    const decision = evaluatePolicy(benchmarkCase(), proposal, now);
    expect(decision.outcome).toBe("DEFERRED");
    expect(decision.eligibleAt).toBe("2026-01-16T03:30:00.000Z");
  });

  it("expires instead of deferring beyond the 48-hour window", () => {
    const item = benchmarkCase({ attempted_at: "2026-01-13T18:00:00.000Z" });
    const decision = evaluatePolicy(item, proposal, new Date("2026-01-15T17:00:00.000Z"));
    expect(decision.outcome).toBe("BLOCKED");
    expect(decision.reasonCodes).toContain("quiet_hours_past_deadline");
  });

  it("escalates low confidence, review risk, and high value", () => {
    const lowConfidence = evaluatePolicy(benchmarkCase(), { ...proposal, confidence: DEFAULT_POLICY.humanReviewConfidence - 0.01 }, new Date("2026-01-15T12:00:00.000Z"));
    const review = evaluatePolicy(benchmarkCase({ risk_flag: "REVIEW" }), proposal, new Date("2026-01-15T12:00:00.000Z"));
    const highValue = evaluatePolicy(benchmarkCase({ amount_paise: 1_000_000 }), proposal, new Date("2026-01-15T12:00:00.000Z"));
    expect([lowConfidence, review, highValue].every((decision) => decision.outcome === "ESCALATED" && decision.action === "ASSISTED_REVIEW")).toBe(true);
  });

  it("approves explicit no-action without creating contact", () => {
    const decision = evaluatePolicy(benchmarkCase({ consent_status: "OPTED_OUT" }), { action: "NO_ACTION", delayMinutes: 0, confidence: 1 }, new Date());
    expect(decision).toMatchObject({ outcome: "APPROVED", action: "NO_ACTION" });
  });

  it("returns every active mandatory stop reason", () => {
    expect(mandatoryStopReasons({
      paymentCaptured: true,
      orderPaid: false,
      optedOut: true,
      riskBlocked: false,
      recoveryWindowExpired: false,
      attemptsExhausted: false,
      contactCapReached: false,
      operatorStopped: false,
      contradictoryPaymentState: true,
    })).toEqual(["payment_captured", "opted_out", "contradictory_payment_state"]);
  });
});
