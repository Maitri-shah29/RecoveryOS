import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { BenchmarkReport, FrozenPolicyPlans } from "@/lib/benchmark/evaluator";
import type { EvaluatorFixture } from "@/lib/benchmark/generator";
import { ACTION_COST_PAISE } from "@/lib/benchmark/constants";
import { policyNames } from "@/lib/domain/schemas";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { ApiError } from "@/lib/http/api";

export async function loadCommittedReport(): Promise<BenchmarkReport> {
  return JSON.parse(await readFile(path.join(process.cwd(), "reports", "heldout-v1.0.0.json"), "utf8")) as BenchmarkReport;
}

export async function persistCommittedEvaluation(batchId: string, idempotencyKey: string) {
  const { merchant, policy } = await ensureSyntheticMerchant(prisma);
  const [batch, report, fixture, ...planSets] = await Promise.all([
    prisma.batch.findFirst({ where: { id: batchId, merchantId: merchant.id }, include: { cases: true } }),
    loadCommittedReport(),
    readFile(path.join(process.cwd(), "fixtures", "evaluator", "potential-outcomes-v1.0.0.json"), "utf8").then((value) => JSON.parse(value) as EvaluatorFixture),
    ...policyNames.map((name) => readFile(path.join(process.cwd(), "fixtures", "public", "frozen-plans", `${name.toLowerCase()}.json`), "utf8").then((value) => JSON.parse(value) as FrozenPolicyPlans)),
  ]);
  if (!batch) throw new ApiError(404, "Batch not found.");
  if (batch.mode !== "BENCHMARK" || batch.datasetVersion !== report.dataset_version) throw new ApiError(409, "Only the matching frozen benchmark batch can be evaluated.");
  const heldoutByExternalId = new Map(batch.cases.filter((item) => item.datasetSplit === "heldout").map((item) => [item.externalCaseId, item]));
  if (heldoutByExternalId.size !== 100) throw new ApiError(409, "The batch does not contain the frozen 100-case held-out split.");
  const outcomes = new Map(fixture.outcomes.map((outcome) => [`${outcome.case_id}|${outcome.action}|${outcome.delay_minutes}`, outcome]));
  return runIdempotentMutation(prisma, merchant.id, `/api/evaluations/${batchId}/run`, idempotencyKey, { batchId, datasetChecksum: report.dataset_checksum }, async (tx) => {
    const run = await tx.evaluationRun.create({ data: {
      merchantId: merchant.id, batchId, policyVersionId: policy.id, datasetVersion: report.dataset_version,
      datasetChecksum: report.dataset_checksum, seedId: report.seed_id, state: "COMPLETED", result: report as unknown as Prisma.InputJsonObject, completedAt: new Date(),
    } });
    for (const planSet of planSets) {
      for (const plan of planSet.plans) {
        const item = heldoutByExternalId.get(plan.case_id);
        const outcome = outcomes.get(`${plan.case_id}|${plan.action}|${plan.delay_minutes}`);
        if (!item || !outcome) throw new ApiError(500, `Evaluation evidence is incomplete for ${plan.case_id}.`);
        const recovered = outcome.recovered && outcome.recovery_delay_minutes !== null && outcome.recovery_delay_minutes < 2_880;
        await tx.evaluationOutcome.create({ data: {
          evaluationRunId: run.id, caseId: item.id, policyName: plan.policy, action: plan.action,
          delayMinutes: plan.delay_minutes, recovered, recoveredPaise: recovered ? item.amountPaise : 0,
          interventionCostPaise: ACTION_COST_PAISE[plan.action],
          outcomeAt: recovered ? new Date(item.attemptedAt.getTime() + (outcome.recovery_delay_minutes ?? 0) * 60_000) : null,
        } });
      }
    }
    return { status: 201, body: { evaluation_id: run.id, state: "COMPLETED", report } as unknown as Prisma.InputJsonObject };
  });
}

export async function getEvaluation(id: string) {
  if (id === "heldout-v1.0.0") return { id, result: await loadCommittedReport(), outcomes: [] };
  const run = await prisma.evaluationRun.findUnique({ where: { id }, include: { outcomes: true } });
  if (!run) throw new ApiError(404, "Evaluation not found.");
  return run;
}

export function evaluationCsv(report: BenchmarkReport): string {
  const header = "policy,cases,recovered_cases,revenue_at_risk_paise,gross_recovered_paise,assumed_cost_paise,net_recovered_paise,incremental_net_vs_fixed_paise,contacts,escalations,blocked_cases,unresolved_cases,unauthorized_contacts";
  const rows = report.policies.map((item) => [item.policy, item.cases, item.recovered_cases, item.revenue_at_risk_paise, item.gross_recovered_paise, item.assumed_cost_paise, item.net_recovered_paise, item.incremental_net_vs_fixed_paise, item.contacts, item.escalations, item.blocked_cases, item.unresolved_cases, item.unauthorized_contacts].join(","));
  return `${header}\n${rows.join("\n")}\n`;
}
