import { describe, expect, it } from "vitest";
import { actionIdempotencyKey } from "@/lib/domain/idempotency";
import { appendAuditEvent, verifyAuditChain } from "@/lib/audit/chain";

describe("idempotency", () => {
  it("is stable for one merchant/case/action/attempt and distinct otherwise", () => {
    const first = actionIdempotencyKey("merchant", "case", "REMINDER", 1);
    expect(actionIdempotencyKey("merchant", "case", "REMINDER", 1)).toBe(first);
    expect(actionIdempotencyKey("merchant", "case", "REMINDER", 2)).not.toBe(first);
  });
});

describe("audit hash chain", () => {
  it("verifies intact events and detects tampering", () => {
    const first = appendAuditEvent([], {
      event_id: "evt_1", case_id: "case_001", sequence_number: 1, timestamp: "2026-01-01T00:00:00.000Z",
      actor_type: "SYSTEM", event_type: "POLICY_CHECK", input_refs: [], decision: { action: "REMINDER" },
      reason_codes: ["eligible"], policy_snapshot: { version: "v1" },
    });
    const second = appendAuditEvent([first], {
      event_id: "evt_2", case_id: "case_001", sequence_number: 2, timestamp: "2026-01-01T00:01:00.000Z",
      actor_type: "SYSTEM", event_type: "ACTION_SCHEDULED", input_refs: ["evt_1"], decision: { at: "later" },
      reason_codes: ["quiet_hours"], policy_snapshot: { version: "v1" },
    });
    expect(verifyAuditChain([first, second])).toEqual({ valid: true, invalidSequence: null });
    expect(verifyAuditChain([first, { ...second, reason_codes: ["tampered"] }])).toEqual({ valid: false, invalidSequence: 2 });
  });
});
