import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { EvaluatorFixture } from "@/lib/benchmark/generator";
import { DELAYS, VIRTUAL_NOW } from "@/lib/benchmark/constants";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { buildAuditEvent, type PreviousAuditEvent } from "@/lib/audit/chain";
import { DEFAULT_POLICY, POLICY_VERSION } from "@/lib/domain/policy";

function nearestDelay(minutes: number) {
  return DELAYS.reduce((closest, delay) => Math.abs(delay - minutes) < Math.abs(closest - minutes) ? delay : closest);
}

export async function advanceBenchmarkClock(now: Date, idempotencyKey: string) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  const fixture = JSON.parse(await readFile(path.join(process.cwd(), "fixtures", "evaluator", "potential-outcomes-v1.0.0.json"), "utf8")) as EvaluatorFixture;
  const outcomeMap = new Map(fixture.outcomes.map((outcome) => [`${outcome.case_id}|${outcome.action}|${outcome.delay_minutes}`, outcome]));
  return runIdempotentMutation(prisma, merchant.id, "/api/benchmark/advance", idempotencyKey, { now: now.toISOString() }, async (tx) => {
    const actions = await tx.recoveryAction.findMany({
      where: { mode: "BENCHMARK", state: "SCHEDULED", scheduledFor: { lte: now }, recoveryCase: { merchantId: merchant.id } },
      include: {
        recoveryCase: { include: { auditEvents: { orderBy: { sequenceNumber: "desc" }, take: 1, select: { sequenceNumber: true, eventHash: true } } } },
        inboxMessage: true,
      },
    });
    let recovered = 0;
    let retryEligible = 0;
    let exhausted = 0;
    const completedActionIds: string[] = [];
    const sentActionIds: string[] = [];
    const deliveredMessageIds: string[] = [];
    const contactedCaseIds: string[] = [];
    const recoveredCaseIds: string[] = [];
    const retryEligibleCaseIds: string[] = [];
    const exhaustedCaseIds: string[] = [];
    const auditEvents: Prisma.AuditEventCreateManyInput[] = [];
    const auditTailByCase = new Map<string, PreviousAuditEvent | null>(
      actions.map((action) => {
        const previous = action.recoveryCase.auditEvents[0];
        return [
          action.caseId,
          previous
            ? { case_id: action.caseId, sequence_number: previous.sequenceNumber, event_hash: previous.eventHash }
            : null,
        ];
      }),
    );
    const appendPendingAudit = (caseId: string, eventType: string, actionId: string, decision: unknown, reasonCodes: string[]) => {
      const event = buildAuditEvent(auditTailByCase.get(caseId) ?? null, {
        case_id: caseId,
        timestamp: now.toISOString(),
        actor_type: "SYSTEM",
        actor_id: null,
        event_type: eventType,
        input_refs: [actionId],
        decision,
        reason_codes: reasonCodes,
        policy_snapshot: { version: POLICY_VERSION },
        model_metadata: null,
      });
      auditTailByCase.set(caseId, { case_id: caseId, sequence_number: event.sequence_number, event_hash: event.event_hash });
      auditEvents.push({
        id: event.event_id,
        caseId,
        sequenceNumber: event.sequence_number,
        timestamp: now,
        actorType: event.actor_type,
        actorId: event.actor_id,
        eventType: event.event_type,
        inputRefs: event.input_refs,
        decision: event.decision as Prisma.InputJsonValue,
        reasonCodes: event.reason_codes,
        policySnapshot: event.policy_snapshot as Prisma.InputJsonValue,
        modelMetadata: event.model_metadata as Prisma.InputJsonValue,
        previousHash: event.previous_hash,
        eventHash: event.event_hash,
      });
    };

    for (const action of actions) {
      if (action.inboxMessage) {
        deliveredMessageIds.push(action.inboxMessage.id);
        contactedCaseIds.push(action.caseId);
      }
      appendPendingAudit(action.caseId, "ACTION_SENT", action.id, { action: action.type, virtual_time: now.toISOString(), mode: "BENCHMARK" }, ["virtual_clock_due"]);
      const delay = nearestDelay(Math.max(0, Math.round(((action.scheduledFor ?? now).getTime() - new Date(VIRTUAL_NOW).getTime()) / 60_000)));
      const outcome = outcomeMap.get(`${action.recoveryCase.externalCaseId}|${action.type}|${delay}`) ?? outcomeMap.get(`${action.recoveryCase.externalCaseId}|${action.type}|0`);
      if (outcome?.recovered && outcome.recovery_delay_minutes !== null && outcome.recovery_delay_minutes < 2_880) {
        completedActionIds.push(action.id);
        recoveredCaseIds.push(action.caseId);
        appendPendingAudit(action.caseId, "PAYMENT_RECOVERED", action.id, { recovery_state: "RECOVERED", amount_paise: action.recoveryCase.amountPaise, label: "Recovered — simulation" }, ["deterministic_simulator_outcome"]);
        recovered += 1;
      } else {
        sentActionIds.push(action.id);
        const recoveryDeadline = new Date(action.recoveryCase.attemptedAt.getTime() + DEFAULT_POLICY.recoveryWindowHours * 60 * 60 * 1_000);
        const attemptsExhausted = action.attemptNumber >= DEFAULT_POLICY.maxActionsPerOrder;
        if (now >= recoveryDeadline || attemptsExhausted) {
          exhaustedCaseIds.push(action.caseId);
          appendPendingAudit(action.caseId, "OUTCOME_OBSERVED", action.id, { recovery_state: "EXHAUSTED", recovered: false }, [now >= recoveryDeadline ? "recovery_window_exhausted" : "maximum_attempts_exhausted"]);
          exhausted += 1;
        } else {
          retryEligibleCaseIds.push(action.caseId);
          appendPendingAudit(action.caseId, "OUTCOME_OBSERVED", action.id, { recovery_state: "RETRY_ELIGIBLE", recovered: false }, ["deterministic_simulator_outcome"]);
          retryEligible += 1;
        }
      }
    }

    if (completedActionIds.length > 0) await tx.recoveryAction.updateMany({ where: { id: { in: completedActionIds } }, data: { state: "COMPLETED" } });
    if (sentActionIds.length > 0) await tx.recoveryAction.updateMany({ where: { id: { in: sentActionIds } }, data: { state: "SENT" } });
    if (deliveredMessageIds.length > 0) await tx.inboxMessage.updateMany({ where: { id: { in: deliveredMessageIds } }, data: { deliveredAt: now } });
    if (recoveredCaseIds.length > 0) await tx.recoveryCase.updateMany({ where: { id: { in: recoveredCaseIds } }, data: { recoveryState: "RECOVERED" } });
    if (retryEligibleCaseIds.length > 0) await tx.recoveryCase.updateMany({ where: { id: { in: retryEligibleCaseIds } }, data: { recoveryState: "RETRY_ELIGIBLE" } });
    if (exhaustedCaseIds.length > 0) await tx.recoveryCase.updateMany({ where: { id: { in: exhaustedCaseIds } }, data: { recoveryState: "EXHAUSTED" } });
    if (contactedCaseIds.length > 0) await tx.recoveryCase.updateMany({ where: { id: { in: contactedCaseIds } }, data: { recoveryContacts7d: { increment: 1 } } });
    if (auditEvents.length > 0) await tx.auditEvent.createMany({ data: auditEvents });
    return { status: 200, body: { virtual_time: now.toISOString(), actions_sent: actions.length, recovered, retry_eligible: retryEligible, exhausted } as Prisma.InputJsonObject };
  });
}
