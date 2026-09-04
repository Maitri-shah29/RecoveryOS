import { Prisma, type OperatingMode } from "@prisma/client";
import { benchmarkCaseSchema, type BenchmarkCase } from "@/lib/domain/schemas";
import { checksum } from "@/lib/benchmark/generator";
import { prisma } from "@/lib/db/prisma";
import { ensureSyntheticMerchant } from "@/lib/db/merchant";
import { runIdempotentMutation } from "@/lib/db/idempotency";
import { appendCaseAudit } from "@/lib/audit/store";
import { ApiError } from "@/lib/http/api";

export type ImportBatchInput = {
  datasetVersion: string;
  mode: OperatingMode;
  cases: unknown[];
  rejectedRows?: { row: number; issues: string[] }[];
};

export async function importBatch(input: ImportBatchInput, idempotencyKey: string) {
  const { merchant } = await ensureSyntheticMerchant(prisma);
  const parsed: BenchmarkCase[] = [];
  const rejected = [...(input.rejectedRows ?? [])];
  input.cases.forEach((candidate, index) => {
    const result = benchmarkCaseSchema.safeParse(candidate);
    if (result.success) parsed.push(result.data);
    else rejected.push({ row: index + 1, issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
  });
  if (parsed.length === 0) throw new ApiError(422, "No valid cases were supplied.", rejected);
  const duplicateIds = parsed.map((item) => item.case_id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) throw new ApiError(409, "Duplicate case IDs were supplied.", [...new Set(duplicateIds)]);
  const datasetChecksum = checksum(parsed);
  return runIdempotentMutation(prisma, merchant.id, "/api/batches/import", idempotencyKey, { input, datasetChecksum }, async (tx) => {
    const existingCases = await tx.recoveryCase.findMany({ where: { merchantId: merchant.id, externalCaseId: { in: parsed.map((item) => item.case_id) } }, select: { externalCaseId: true } });
    if (existingCases.length > 0) throw new ApiError(409, "One or more case IDs already exist.", existingCases.map((item) => item.externalCaseId));
    const batch = await tx.batch.create({ data: {
      merchantId: merchant.id,
      externalId: `${input.datasetVersion}-${datasetChecksum.slice(0, 10)}`,
      mode: input.mode,
      datasetVersion: input.datasetVersion,
      datasetChecksum,
      caseCount: parsed.length,
    } });
    for (const item of parsed) {
      const recoveryCase = await tx.recoveryCase.create({ data: {
        merchantId: merchant.id, batchId: batch.id, externalCaseId: item.case_id, customerId: item.customer_id,
        orderId: item.order_id, mode: input.mode, amountPaise: item.amount_paise, currency: item.currency,
        failureCode: item.failure_code, failureDescription: item.failure_description, paymentMethod: item.payment_method,
        attemptedAt: item.attempted_at, customerSegment: item.customer_segment, priorAttempts: item.prior_attempts,
        recoveryContacts7d: item.recovery_contacts_7d, consentStatus: item.consent_status, riskFlag: item.risk_flag,
        preferredChannel: item.preferred_channel, customerTimezone: item.customer_timezone,
        paymentState: item.order_paid ? "PAID" : "FAILED", datasetVersion: input.datasetVersion,
        datasetSplit: item.split, simulationProfileId: item.simulation_profile_id,
      } });
      await tx.paymentAttempt.create({ data: { caseId: recoveryCase.id, attemptNumber: 1, amountPaise: item.amount_paise, currency: "INR", state: item.order_paid ? "PAID" : "FAILED", attemptedAt: item.attempted_at } });
      await appendCaseAudit(tx, recoveryCase.id, { eventType: "CASE_IMPORTED", inputRefs: [item.case_id], decision: { recovery_state: "DETECTED", mode: input.mode }, reasonCodes: ["schema_valid", "batch_imported"] });
    }
    const body: Prisma.InputJsonObject = { batch_id: batch.id, accepted: parsed.length, rejected, dataset_checksum: datasetChecksum, mode: input.mode };
    return { status: 201, body };
  });
}
