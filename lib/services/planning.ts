import { randomUUID } from "node:crypto";
import { Prisma, type RecoveryCase, type RecoveryState } from "@prisma/client";
import { VIRTUAL_NOW } from "@/lib/benchmark/constants";
import { planWithSafeFallback, type PlannerOutput } from "@/lib/ai/planner";
import { recoveryCaseToPlannerInput } from "@/lib/domain/case-mapper";
import { evaluatePolicy, POLICY_VERSION } from "@/lib/domain/policy";
import { actionIdempotencyKey } from "@/lib/domain/idempotency";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { readIdempotencyReplay, runIdempotentMutation } from "@/lib/db/idempotency";
import { buildAuditEvent, type PreviousAuditEvent } from "@/lib/audit/chain";
import { ApiError } from "@/lib/http/api";
import { deterministicFallbackRecommendation, FALLBACK_PLANNER_VERSION } from "@/lib/ai/fallback";
import { AI_SCHEMA_VERSION, PROMPT_VERSION } from "@/lib/ai/schema";
import { buildEscalationContext } from "@/lib/domain/escalation";

type PlannedCase = {
  item: RecoveryCase & {
    actions: { state: string; type: string; attemptNumber: number }[];
    auditEvents: { sequenceNumber: number; eventHash: string }[];
  };
  output: PlannerOutput;
  decision: ReturnType<typeof evaluatePolicy>;
  preEligibilityBlocked: boolean;
};

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function planBatch(batchId: string, idempotencyKey: string) {
  const { merchant, policy } = await ensureSyntheticMerchant(prisma);
  const route = `/api/batches/${batchId}/plan`;
  const replay = await readIdempotencyReplay(prisma, merchant.id, route, idempotencyKey, { batchId });
  if (replay) return replay;
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, merchantId: merchant.id },
    include: {
      cases: {
        include: {
          actions: { select: { state: true, type: true, attemptNumber: true } },
          auditEvents: { orderBy: { sequenceNumber: "desc" }, take: 1, select: { sequenceNumber: true, eventHash: true } },
        },
      },
    },
  });
  if (!batch) throw new ApiError(404, "Batch not found.");
  if (batch.state !== "IMPORTED") throw new ApiError(409, "Batch has already been planned.");
  const virtualNow = batch.mode === "BENCHMARK" ? new Date(VIRTUAL_NOW) : new Date();
  const planned = await mapConcurrent(batch.cases, 8, async (item): Promise<PlannedCase> => {
    const plannerInput = {
      ...recoveryCaseToPlannerInput(item),
      action_in_flight: item.actions.some((action) => ["PROPOSED", "SCHEDULED", "SENT"].includes(action.state)),
    };
    const eligibility = evaluatePolicy(plannerInput, { action: "REMINDER", delayMinutes: 0, confidence: 1 }, virtualNow);
    if (eligibility.outcome === "BLOCKED") {
      const fallback = deterministicFallbackRecommendation(plannerInput);
      const output: PlannerOutput = {
        recommendation: { ...fallback, confidence: 1, recommended_action: "NO_ACTION", recommended_delay_minutes: 0, expected_recovery_probability: 0, reason_codes: eligibility.reasonCodes, customer_message: "", requires_human_review: false },
        source: "fallback_rule", plannerVersion: FALLBACK_PLANNER_VERSION, model: null, promptVersion: PROMPT_VERSION,
        schemaVersion: AI_SCHEMA_VERSION, attempts: 0, fallbackReason: "deterministic eligibility gate",
      };
      return { item, output, decision: eligibility, preEligibilityBlocked: true };
    }
    const output = await planWithSafeFallback(plannerInput);
    const recommendation = output.recommendation;
    const decision = evaluatePolicy(plannerInput, {
      action: recommendation.recommended_action,
      delayMinutes: recommendation.recommended_delay_minutes,
      confidence: recommendation.confidence,
    }, virtualNow);
    return { item, output, decision, preEligibilityBlocked: false };
  });

  return runIdempotentMutation(prisma, merchant.id, route, idempotencyKey, { batchId }, async (tx) => {
    const current = await tx.batch.findUnique({ where: { id: batchId } });
    if (!current || current.state !== "IMPORTED") throw new ApiError(409, "Batch state changed before plans could be frozen.");

    let scheduled = 0;
    let blocked = 0;
    let escalated = 0;
    let fallback = 0;
    const plans: Prisma.RecoveryPlanCreateManyInput[] = [];
    const actions: Prisma.RecoveryActionCreateManyInput[] = [];
    const inboxMessages: Prisma.InboxMessageCreateManyInput[] = [];
    const escalations: Prisma.EscalationCreateManyInput[] = [];
    const auditEvents: Prisma.AuditEventCreateManyInput[] = [];
    const caseIdsByState = new Map<RecoveryState, string[]>();
    const auditTailByCase = new Map<string, PreviousAuditEvent | null>(
      planned.map(({ item }) => {
        const previous = item.auditEvents[0];
        return [
          item.id,
          previous
            ? { case_id: item.id, sequence_number: previous.sequenceNumber, event_hash: previous.eventHash }
            : null,
        ];
      }),
    );
    const setFinalState = (caseId: string, state: RecoveryState) => {
      const ids = caseIdsByState.get(state) ?? [];
      ids.push(caseId);
      caseIdsByState.set(state, ids);
    };
    const appendPendingAudit = (
      caseId: string,
      input: {
        actorType?: "SYSTEM" | "AI" | "OPERATOR" | "CUSTOMER" | "RAZORPAY";
        eventType: string;
        inputRefs?: string[];
        decision: unknown;
        reasonCodes: string[];
        modelMetadata?: unknown;
      },
    ) => {
      const timestamp = new Date();
      const event = buildAuditEvent(auditTailByCase.get(caseId) ?? null, {
        case_id: caseId,
        timestamp: timestamp.toISOString(),
        actor_type: input.actorType ?? "SYSTEM",
        actor_id: null,
        event_type: input.eventType,
        input_refs: input.inputRefs ?? [],
        decision: input.decision,
        reason_codes: input.reasonCodes,
        policy_snapshot: { version: POLICY_VERSION },
        model_metadata: input.modelMetadata ?? null,
      });
      auditTailByCase.set(caseId, {
        case_id: caseId,
        sequence_number: event.sequence_number,
        event_hash: event.event_hash,
      });
      auditEvents.push({
        id: event.event_id,
        caseId,
        sequenceNumber: event.sequence_number,
        timestamp,
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

    for (const { item, output, decision, preEligibilityBlocked } of planned) {
      const recommendation = output.recommendation;
      const planId = randomUUID();
      if (output.source === "fallback_rule") fallback += 1;
      if (!preEligibilityBlocked) {
        appendPendingAudit(item.id, {
          actorType: output.source === "openai" ? "AI" : "SYSTEM",
          eventType: "DIAGNOSIS",
          inputRefs: [item.externalCaseId],
          decision: recommendation,
          reasonCodes: recommendation.reason_codes,
          modelMetadata: { source: output.source, model: output.model, planner_version: output.plannerVersion, prompt_version: output.promptVersion, schema_version: output.schemaVersion, attempts: output.attempts, fallback_reason: output.fallbackReason },
        });
      }
      plans.push({
        id: planId,
        caseId: item.id,
        policyVersionId: policy.id,
        plannerVersion: output.plannerVersion,
        plannerType: output.source,
        diagnosis: recommendation.diagnosis,
        confidence: recommendation.confidence,
        proposedAction: recommendation.recommended_action,
        delayMinutes: recommendation.recommended_delay_minutes,
        reasonCodes: recommendation.reason_codes,
        policyDecision: decision as unknown as Prisma.InputJsonObject,
        frozenAt: new Date(),
      });
      appendPendingAudit(item.id, {
        eventType: "POLICY_CHECK",
        inputRefs: [planId],
        decision,
        reasonCodes: decision.reasonCodes,
      });

      if (preEligibilityBlocked) {
        setFinalState(item.id, "INELIGIBLE_STOPPED");
        appendPendingAudit(item.id, { eventType: "STOP", inputRefs: [planId], decision: { recovery_state: "INELIGIBLE_STOPPED" }, reasonCodes: recommendation.reason_codes });
        blocked += 1;
      } else if (recommendation.recommended_action === "NO_ACTION") {
        setFinalState(item.id, "POLICY_BLOCKED");
        appendPendingAudit(item.id, { eventType: "STOP", inputRefs: [planId], decision: { recovery_state: "POLICY_BLOCKED" }, reasonCodes: recommendation.reason_codes });
        blocked += 1;
      } else if (decision.outcome === "BLOCKED") {
        setFinalState(item.id, "POLICY_BLOCKED");
        appendPendingAudit(item.id, { eventType: "STOP", inputRefs: [planId], decision: { recovery_state: "POLICY_BLOCKED" }, reasonCodes: decision.reasonCodes });
        blocked += 1;
      } else if (decision.outcome === "ESCALATED" || recommendation.requires_human_review) {
        setFinalState(item.id, "ESCALATED");
        const reasonCode = decision.reasonCodes[0] ?? "human_review_required";
        escalations.push({
          caseId: item.id,
          reasonCode,
          context: buildEscalationContext({
            externalCaseId: item.externalCaseId,
            orderId: item.orderId,
            amountPaise: item.amountPaise,
            failureCode: item.failureCode,
            failureDescription: item.failureDescription,
            diagnosis: recommendation.diagnosis,
            confidence: recommendation.confidence,
            policyChecks: decision.gateResults,
            actions: item.actions,
            reasonCode,
          }) as Prisma.InputJsonObject,
        });
        appendPendingAudit(item.id, { eventType: "ESCALATION", inputRefs: [planId], decision: { recovery_state: "ESCALATED" }, reasonCodes: decision.reasonCodes });
        escalated += 1;
      } else if (batch.mode === "RAZORPAY_PROOF") {
        setFinalState(item.id, "AWAITING_APPROVAL");
        appendPendingAudit(item.id, { eventType: "AWAITING_APPROVAL", inputRefs: [planId], decision: { recovery_state: "AWAITING_APPROVAL", proposed_action: decision.action }, reasonCodes: ["proof_mode_requires_operator"] });
      } else {
        const actionId = randomUUID();
        const attemptNumber = item.priorAttempts + 1;
        const scheduledFor = decision.eligibleAt ? new Date(decision.eligibleAt) : virtualNow;
        appendPendingAudit(item.id, { eventType: "ACTION_APPROVED", inputRefs: [planId], decision: { action: decision.action }, reasonCodes: decision.reasonCodes });
        actions.push({
          id: actionId, caseId: item.id, planId, policyVersionId: policy.id, mode: "BENCHMARK", type: decision.action,
          state: "SCHEDULED", attemptNumber, idempotencyKey: actionIdempotencyKey(merchant.id, item.externalCaseId, decision.action, attemptNumber), scheduledFor,
        });
        if (["REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK"].includes(decision.action)) {
          inboxMessages.push({ caseId: item.id, actionId, channel: item.preferredChannel, body: recommendation.customer_message, deliverAt: scheduledFor });
        }
        setFinalState(item.id, "ACTION_SCHEDULED");
        appendPendingAudit(item.id, { eventType: "ACTION_SCHEDULED", inputRefs: [actionId], decision: { action: decision.action, scheduled_for: scheduledFor.toISOString(), mode: "BENCHMARK" }, reasonCodes: decision.reasonCodes });
        scheduled += 1;
      }
    }

    await tx.recoveryPlan.createMany({ data: plans });
    if (escalations.length > 0) await tx.escalation.createMany({ data: escalations });
    if (actions.length > 0) await tx.recoveryAction.createMany({ data: actions });
    if (inboxMessages.length > 0) await tx.inboxMessage.createMany({ data: inboxMessages });
    if (auditEvents.length > 0) await tx.auditEvent.createMany({ data: auditEvents });
    for (const [state, caseIds] of caseIdsByState) {
      await tx.recoveryCase.updateMany({ where: { id: { in: caseIds } }, data: { recoveryState: state } });
    }
    await tx.batch.update({ where: { id: batchId }, data: { state: "PLANNED" } });
    const body: Prisma.InputJsonObject = { batch_id: batchId, planned: planned.length, scheduled, blocked, escalated, fallback_plans: fallback, state: "PLANNED" };
    return { status: 200, body };
  });
}
