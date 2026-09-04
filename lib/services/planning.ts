import { Prisma, type RecoveryCase } from "@prisma/client";
import { VIRTUAL_NOW } from "@/lib/benchmark/constants";
import { planWithSafeFallback, type PlannerOutput } from "@/lib/ai/planner";
import { recoveryCaseToPlannerInput } from "@/lib/domain/case-mapper";
import { evaluatePolicy } from "@/lib/domain/policy";
import { actionIdempotencyKey } from "@/lib/domain/idempotency";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { readIdempotencyReplay, runIdempotentMutation } from "@/lib/db/idempotency";
import { appendCaseAudit } from "@/lib/audit/store";
import { ApiError } from "@/lib/http/api";
import { deterministicFallbackRecommendation, FALLBACK_PLANNER_VERSION } from "@/lib/ai/fallback";
import { AI_SCHEMA_VERSION, PROMPT_VERSION } from "@/lib/ai/schema";

type PlannedCase = { item: RecoveryCase & { actions: { state: string }[] }; output: PlannerOutput; decision: ReturnType<typeof evaluatePolicy>; preEligibilityBlocked: boolean };

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
  const batch = await prisma.batch.findFirst({ where: { id: batchId, merchantId: merchant.id }, include: { cases: { include: { actions: { where: { state: { in: ["PROPOSED", "SCHEDULED", "SENT"] } }, select: { state: true } } } } } });
  if (!batch) throw new ApiError(404, "Batch not found.");
  if (batch.state !== "IMPORTED") throw new ApiError(409, "Batch has already been planned.");
  const virtualNow = batch.mode === "BENCHMARK" ? new Date(VIRTUAL_NOW) : new Date();
  const planned = await mapConcurrent(batch.cases, 8, async (item): Promise<PlannedCase> => {
    const plannerInput = { ...recoveryCaseToPlannerInput(item), action_in_flight: item.actions.length > 0 };
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
    for (const { item, output, decision, preEligibilityBlocked } of planned) {
      const recommendation = output.recommendation;
      if (output.source === "fallback_rule") fallback += 1;
      if (!preEligibilityBlocked) {
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "ANALYZING" } });
        await appendCaseAudit(tx, item.id, {
          actorType: output.source === "openai" ? "AI" : "SYSTEM",
          eventType: "DIAGNOSIS",
          inputRefs: [item.externalCaseId],
          decision: recommendation as Prisma.InputJsonObject,
          reasonCodes: recommendation.reason_codes,
          modelMetadata: { source: output.source, model: output.model, planner_version: output.plannerVersion, prompt_version: output.promptVersion, schema_version: output.schemaVersion, attempts: output.attempts, fallback_reason: output.fallbackReason },
        });
      }
      const plan = await tx.recoveryPlan.create({ data: {
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
      } });
      await appendCaseAudit(tx, item.id, {
        eventType: "POLICY_CHECK",
        inputRefs: [plan.id],
        decision: decision as unknown as Prisma.InputJsonObject,
        reasonCodes: decision.reasonCodes,
      });

      if (preEligibilityBlocked) {
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "INELIGIBLE_STOPPED" } });
        await appendCaseAudit(tx, item.id, { eventType: "STOP", inputRefs: [plan.id], decision: { recovery_state: "INELIGIBLE_STOPPED" }, reasonCodes: recommendation.reason_codes });
        blocked += 1;
      } else if (recommendation.recommended_action === "NO_ACTION") {
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "POLICY_BLOCKED" } });
        await appendCaseAudit(tx, item.id, { eventType: "STOP", inputRefs: [plan.id], decision: { recovery_state: "POLICY_BLOCKED" }, reasonCodes: recommendation.reason_codes });
        blocked += 1;
      } else if (decision.outcome === "BLOCKED") {
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "POLICY_BLOCKED" } });
        await appendCaseAudit(tx, item.id, { eventType: "STOP", inputRefs: [plan.id], decision: { recovery_state: "POLICY_BLOCKED" }, reasonCodes: decision.reasonCodes });
        blocked += 1;
      } else if (decision.outcome === "ESCALATED" || recommendation.requires_human_review) {
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "ESCALATED" } });
        await tx.escalation.create({ data: { caseId: item.id, reasonCode: decision.reasonCodes[0] ?? "human_review_required", context: { diagnosis: recommendation.diagnosis, confidence: recommendation.confidence, amount_paise: item.amountPaise, policy_checks: decision.gateResults } } });
        await appendCaseAudit(tx, item.id, { eventType: "ESCALATION", inputRefs: [plan.id], decision: { recovery_state: "ESCALATED" }, reasonCodes: decision.reasonCodes });
        escalated += 1;
      } else if (batch.mode === "RAZORPAY_PROOF") {
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "AWAITING_APPROVAL" } });
        await appendCaseAudit(tx, item.id, { eventType: "AWAITING_APPROVAL", inputRefs: [plan.id], decision: { recovery_state: "AWAITING_APPROVAL", proposed_action: decision.action }, reasonCodes: ["proof_mode_requires_operator"] });
      } else {
        const attemptNumber = item.priorAttempts + 1;
        const scheduledFor = decision.eligibleAt ? new Date(decision.eligibleAt) : virtualNow;
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "ACTION_APPROVED" } });
        await appendCaseAudit(tx, item.id, { eventType: "ACTION_APPROVED", inputRefs: [plan.id], decision: { action: decision.action }, reasonCodes: decision.reasonCodes });
        const action = await tx.recoveryAction.create({ data: {
          caseId: item.id, planId: plan.id, policyVersionId: policy.id, mode: "BENCHMARK", type: decision.action,
          state: "SCHEDULED", attemptNumber, idempotencyKey: actionIdempotencyKey(merchant.id, item.externalCaseId, decision.action, attemptNumber), scheduledFor,
        } });
        if (["REMINDER", "RETRY_INVITATION", "FRESH_CHECKOUT_LINK"].includes(decision.action)) {
          await tx.inboxMessage.create({ data: { caseId: item.id, actionId: action.id, channel: item.preferredChannel, body: recommendation.customer_message, deliverAt: scheduledFor } });
        }
        await tx.recoveryCase.update({ where: { id: item.id }, data: { recoveryState: "ACTION_SCHEDULED" } });
        await appendCaseAudit(tx, item.id, { eventType: "ACTION_SCHEDULED", inputRefs: [action.id], decision: { action: decision.action, scheduled_for: scheduledFor.toISOString(), mode: "BENCHMARK" }, reasonCodes: decision.reasonCodes });
        scheduled += 1;
      }
    }
    await tx.batch.update({ where: { id: batchId }, data: { state: "PLANNED" } });
    const body: Prisma.InputJsonObject = { batch_id: batchId, planned: planned.length, scheduled, blocked, escalated, fallback_plans: fallback, state: "PLANNED" };
    return { status: 200, body };
  });
}
