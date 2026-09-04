import { describe, expect, it } from "vitest";
import { forceRecoveredFromPayment, IllegalTransitionError, isTerminalRecoveryState, transitionPayment, transitionRecovery } from "@/lib/domain/state-machines";

describe("recovery state machine", () => {
  it("permits the benchmark happy path", () => {
    expect(transitionRecovery("DETECTED", "ANALYZING")).toBe("ANALYZING");
    expect(transitionRecovery("ANALYZING", "ACTION_APPROVED")).toBe("ACTION_APPROVED");
    expect(transitionRecovery("ACTION_APPROVED", "ACTION_SENT")).toBe("ACTION_SENT");
    expect(transitionRecovery("ACTION_SENT", "RECOVERED")).toBe("RECOVERED");
  });

  it("rejects scheduling from a terminal state", () => {
    expect(() => transitionRecovery("RECOVERED", "ACTION_SCHEDULED")).toThrow(IllegalTransitionError);
    expect(isTerminalRecoveryState("RECOVERED")).toBe(true);
  });

  it("lets verified payment truth force recovery without rewriting payment state", () => {
    expect(forceRecoveredFromPayment("POLICY_BLOCKED", "CAPTURED")).toBe("RECOVERED");
    expect(forceRecoveredFromPayment("ACTION_SENT", "FAILED")).toBe("ACTION_SENT");
  });
});

describe("payment state machine", () => {
  it("allows failed to captured and forbids terminal regression", () => {
    expect(transitionPayment("FAILED", "CAPTURED")).toBe("CAPTURED");
    expect(() => transitionPayment("CAPTURED", "AUTHORIZED")).toThrow(IllegalTransitionError);
    expect(() => transitionPayment("PAID", "FAILED")).toThrow(IllegalTransitionError);
  });
});
