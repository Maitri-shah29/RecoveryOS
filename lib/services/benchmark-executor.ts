import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { EvaluatorFixture } from "@/lib/benchmark/generator";
import { DELAYS, VIRTUAL_NOW } from "@/lib/benchmark/constants";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { appendCaseAudit } from "@/lib/audit/store";

function nearestDelay(minutes: number) {
  return DELAYS.reduce((closest, delay) => Math.abs(delay - minutes) < Math.abs(closest - minutes) ? delay : closest);
}

export async function advanceBenchmarkClock(now: Date, idempotencyKey: string) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  const fixture = JSON.parse(await readFile(path.join(process.cwd(), "fixtures", "evaluator", "potential-outcomes-v1.0.0.json"), "utf8")) as EvaluatorFixture;
  const outcomeMap = new Map(fixture.outcomes.map((outcome) => [`${outcome.case_id}|${outcome.action}|${outcome.delay_minutes}`, outcome]));
  return runIdempotentMutation(prisma, merchant.id, "/api/benchmark/advance", idempotencyKey, { now: now.toISOString() }, async (tx) => {
    const actions = await tx.recoveryAction.findMany({ where: { mode: "BENCHMARK", state: "SCHEDULED", scheduledFor: { lte: now }, recoveryCase: { merchantId: merchant.id } }, include: { recoveryCase: true, inboxMessage: true } });
    let recovered = 0;
    let retryEligible = 0;
    for (const action of actions) {
      await tx.recoveryAction.update({ where: { id: action.id }, data: { state: "SENT" } });
      if (action.inboxMessage) await tx.inboxMessage.update({ where: { id: action.inboxMessage.id }, data: { deliveredAt: now } });
      await tx.recoveryCase.update({ where: { id: action.caseId }, data: { recoveryState: "ACTION_SENT", recoveryContacts7d: { increment: action.inboxMessage ? 1 : 0 } } });
      await appendCaseAudit(tx, action.caseId, { eventType: "ACTION_SENT", inputRefs: [action.id], decision: { action: action.type, virtual_time: now.toISOString(), mode: "BENCHMARK" }, reasonCodes: ["virtual_clock_due"] });
      const delay = nearestDelay(Math.max(0, Math.round(((action.scheduledFor ?? now).getTime() - new Date(VIRTUAL_NOW).getTime()) / 60_000)));
      const outcome = outcomeMap.get(`${action.recoveryCase.externalCaseId}|${action.type}|${delay}`) ?? outcomeMap.get(`${action.recoveryCase.externalCaseId}|${action.type}|0`);
      if (outcome?.recovered && outcome.recovery_delay_minutes !== null && outcome.recovery_delay_minutes < 2_880) {
        await tx.recoveryAction.update({ where: { id: action.id }, data: { state: "COMPLETED" } });
        await tx.recoveryCase.update({ where: { id: action.caseId }, data: { recoveryState: "RECOVERED" } });
        await appendCaseAudit(tx, action.caseId, { eventType: "PAYMENT_RECOVERED", inputRefs: [action.id], decision: { recovery_state: "RECOVERED", amount_paise: action.recoveryCase.amountPaise, label: "Recovered — simulation" }, reasonCodes: ["deterministic_simulator_outcome"] });
        recovered += 1;
      } else {
        await tx.recoveryCase.update({ where: { id: action.caseId }, data: { recoveryState: "RETRY_ELIGIBLE" } });
        await appendCaseAudit(tx, action.caseId, { eventType: "OUTCOME_OBSERVED", inputRefs: [action.id], decision: { recovery_state: "RETRY_ELIGIBLE", recovered: false }, reasonCodes: ["deterministic_simulator_outcome"] });
        retryEligible += 1;
      }
    }
    return { status: 200, body: { virtual_time: now.toISOString(), actions_sent: actions.length, recovered, retry_eligible: retryEligible } as Prisma.InputJsonObject };
  });
}
