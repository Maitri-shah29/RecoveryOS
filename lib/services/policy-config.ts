import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { DEFAULT_POLICY, evaluatePolicy, type PolicyConfig } from "@/lib/domain/policy";
import { recoveryCaseToPlannerInput } from "@/lib/domain/case-mapper";
import type { Prisma } from "@prisma/client";

export const policyConfigSchema = z.object({
  maxActionsPerOrder: z.number().int().min(1).max(5),
  maxContactsPerCustomer7d: z.number().int().min(1).max(10),
  recoveryWindowHours: z.number().int().min(1).max(168),
  quietHoursStart: z.number().int().min(0).max(23),
  quietHoursEnd: z.number().int().min(0).max(23),
  minimumAmountPaise: z.number().int().nonnegative(),
  humanReviewConfidence: z.number().min(0).max(1),
  highValueReviewPaise: z.number().int().nonnegative(),
}).strict();

export async function getActivePolicy() {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  const active = await prisma.policyVersion.findFirst({ where: { merchantId: merchant.id, isActive: true }, orderBy: { createdAt: "desc" } });
  return active ?? { version: "policy-v1.0.0", config: DEFAULT_POLICY, createdAt: new Date(0) };
}

export async function updatePolicy(config: PolicyConfig, idempotencyKey: string) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  const cases = await prisma.recoveryCase.findMany({ where: { merchantId: merchant.id, mode: "BENCHMARK" }, include: { plans: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const previewEligible = cases.filter((item) => {
    const plan = item.plans[0];
    if (!plan) return false;
    const decision = evaluatePolicy(recoveryCaseToPlannerInput(item), { action: plan.proposedAction, delayMinutes: plan.delayMinutes as never, confidence: Number(plan.confidence) }, new Date(), config);
    return decision.outcome === "APPROVED" || decision.outcome === "DEFERRED";
  }).length;
  return runIdempotentMutation(prisma, merchant.id, "/api/policy", idempotencyKey, config, async (tx) => {
    await tx.policyVersion.updateMany({ where: { merchantId: merchant.id, isActive: true }, data: { isActive: false } });
    const version = `policy-v1-${Date.now()}`;
    const policy = await tx.policyVersion.create({ data: { merchantId: merchant.id, version, config, isActive: true } });
    return { status: 201, body: { version: policy.version, preview_eligible_cases: previewEligible, config } as unknown as Prisma.InputJsonObject };
  });
}
