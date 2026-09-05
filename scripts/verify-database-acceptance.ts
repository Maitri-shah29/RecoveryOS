import assert from "node:assert/strict";
import type { AuditEvent } from "@/lib/audit/chain";
import { verifyAuditChain } from "@/lib/audit/chain";
import { SYNTHETIC_MERCHANT_ID } from "@/lib/config";
import { prisma } from "@/lib/db/prisma";

const cases = await prisma.recoveryCase.findMany({
  where: { merchantId: SYNTHETIC_MERCHANT_ID },
  include: {
    auditEvents: { orderBy: { sequenceNumber: "asc" } },
    actions: true,
    escalations: { where: { state: "OPEN" } },
  },
});
assert(cases.length >= 180, `Expected at least 180 cases, found ${cases.length}.`);

let verifiedAuditChains = 0;
let executedActions = 0;
for (const item of cases) {
  const events: AuditEvent[] = item.auditEvents.map((event) => ({
    event_id: event.id,
    case_id: event.caseId,
    sequence_number: event.sequenceNumber,
    timestamp: event.timestamp.toISOString(),
    actor_type: event.actorType,
    actor_id: event.actorId,
    event_type: event.eventType,
    input_refs: event.inputRefs as string[],
    decision: event.decision,
    reason_codes: event.reasonCodes,
    policy_snapshot: event.policySnapshot,
    model_metadata: event.modelMetadata ?? null,
    previous_hash: event.previousHash,
    event_hash: event.eventHash,
  }));
  assert.deepEqual(verifyAuditChain(events), { valid: true, invalidSequence: null }, `Audit chain failed for ${item.externalCaseId}.`);
  verifiedAuditChains += 1;
  for (const action of item.actions) {
    assert(action.planId, `Action ${action.id} has no preceding plan.`);
    const policyIndex = events.findIndex((event) => event.event_type === "POLICY_CHECK" && event.input_refs.includes(action.planId!));
    const actionIndex = events.findIndex((event) => ["ACTION_APPROVED", "ACTION_SCHEDULED"].includes(event.event_type) && event.input_refs.includes(action.id));
    assert(policyIndex >= 0, `Action ${action.id} has no audit-linked policy decision.`);
    assert(actionIndex < 0 || policyIndex < actionIndex, `Action ${action.id} precedes its policy decision.`);
    executedActions += 1;
  }
}

const heldout = cases.filter((item) => item.datasetSplit === "heldout" && item.mode === "BENCHMARK");
assert.equal(heldout.length, 100, `Expected 100 held-out cases, found ${heldout.length}.`);
const terminalStates = new Set(["INELIGIBLE_STOPPED", "POLICY_BLOCKED", "ACTION_REJECTED", "RECOVERED", "EXHAUSTED", "EXPIRED", "MANUALLY_STOPPED"]);
const incomplete = heldout.filter((item) => !terminalStates.has(item.recoveryState) && !(item.recoveryState === "ESCALATED" && item.escalations.length > 0));
assert.equal(incomplete.length, 0, `Held-out cases not terminal or explicitly unresolved: ${incomplete.map((item) => item.externalCaseId).join(", ")}`);

const unauthorizedActions = await prisma.recoveryAction.count({
  where: {
    mode: "BENCHMARK",
    type: { in: ["REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK"] },
    OR: [
      { recoveryCase: { consentStatus: { not: "OPTED_IN" } } },
      { recoveryCase: { riskFlag: "BLOCKED" } },
      { recoveryCase: { paymentState: { in: ["CAPTURED", "PAID"] } } },
    ],
  },
});
assert.equal(unauthorizedActions, 0, "Unauthorized benchmark contact was persisted.");
assert.equal(await prisma.recoveryAction.count({ where: { mode: "BENCHMARK", OR: [{ externalReference: { not: null } }, { externalUrl: { not: null } }] } }), 0, "Benchmark mode contains an external Razorpay action.");

const latestEvaluation = await prisma.evaluationRun.findFirst({ where: { merchantId: SYNTHETIC_MERCHANT_ID, state: "COMPLETED" }, orderBy: { completedAt: "desc" }, include: { outcomes: true } });
assert(latestEvaluation, "A completed persisted evaluation is required.");
assert.equal(latestEvaluation.outcomes.length, 400, "Four policies must each evaluate all 100 held-out cases.");
assert.equal(new Set(latestEvaluation.outcomes.map((outcome) => outcome.policyName)).size, 4, "Exactly four evaluation policies are required.");

console.log(JSON.stringify({
  cases: cases.length,
  heldout_terminal_or_exception: heldout.length,
  audit_chains_verified: verifiedAuditChains,
  executed_actions_with_policy_decisions: executedActions,
  unauthorized_contacts: unauthorizedActions,
  evaluation_outcomes: latestEvaluation.outcomes.length,
  policy_count: 4,
  benchmark_external_calls: 0,
}, null, 2));
await prisma.$disconnect();
