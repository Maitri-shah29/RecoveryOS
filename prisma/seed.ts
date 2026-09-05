import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { datasetManifestSchema } from "@/lib/domain/schemas";
import { DEFAULT_POLICY, POLICY_VERSION } from "@/lib/domain/policy";
import { appendAuditEvent } from "@/lib/audit/chain";
import { checksum } from "@/lib/benchmark/generator";

const prisma = new PrismaClient();

async function main() {
  const dataset = datasetManifestSchema.parse(JSON.parse(await readFile(path.join(process.cwd(), "fixtures", "public", "recovery-cases-v1.0.0.json"), "utf8")));
  const merchant = await prisma.merchant.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: { id: "00000000-0000-4000-8000-000000000001", name: "RecoveryOS Synthetic Merchant" },
  });
  const batch = await prisma.batch.upsert({
    where: { merchantId_externalId: { merchantId: merchant.id, externalId: dataset.dataset_version } },
    update: { caseCount: dataset.case_count, datasetChecksum: checksum(dataset.cases) },
    create: {
      merchantId: merchant.id,
      externalId: dataset.dataset_version,
      mode: "BENCHMARK",
      datasetVersion: dataset.dataset_version,
      datasetChecksum: checksum(dataset.cases),
      caseCount: dataset.case_count,
    },
  });
  await prisma.policyVersion.upsert({
    where: { merchantId_version: { merchantId: merchant.id, version: POLICY_VERSION } },
    update: { config: DEFAULT_POLICY, isActive: true },
    create: { merchantId: merchant.id, version: POLICY_VERSION, config: DEFAULT_POLICY, isActive: true },
  });

  await prisma.recoveryCase.createMany({
    data: dataset.cases.map((item) => ({
      merchantId: merchant.id,
      batchId: batch.id,
      externalCaseId: item.case_id,
      customerId: item.customer_id,
      orderId: item.order_id,
      mode: "BENCHMARK",
      amountPaise: item.amount_paise,
      currency: item.currency,
      failureCode: item.failure_code,
      failureDescription: item.failure_description,
      paymentMethod: item.payment_method,
      attemptedAt: item.attempted_at,
      customerSegment: item.customer_segment,
      priorAttempts: item.prior_attempts,
      recoveryContacts7d: item.recovery_contacts_7d,
      consentStatus: item.consent_status,
      riskFlag: item.risk_flag,
      preferredChannel: item.preferred_channel,
      customerTimezone: item.customer_timezone,
      paymentState: item.order_paid ? "PAID" : "FAILED",
      datasetVersion: dataset.dataset_version,
      datasetSplit: item.split,
      simulationProfileId: item.simulation_profile_id,
    })),
    skipDuplicates: true,
  });

  const recoveryCases = await prisma.recoveryCase.findMany({
    where: {
      merchantId: merchant.id,
      externalCaseId: { in: dataset.cases.map((item) => item.case_id) },
    },
    select: { id: true, externalCaseId: true },
  });
  const caseIds = new Map(recoveryCases.map((item) => [item.externalCaseId, item.id]));
  if (caseIds.size !== dataset.case_count) {
    throw new Error(`Expected ${dataset.case_count} persisted cases, found ${caseIds.size}.`);
  }

  await prisma.paymentAttempt.createMany({
    data: dataset.cases.map((item) => ({
      caseId: caseIds.get(item.case_id)!,
      attemptNumber: 1,
      amountPaise: item.amount_paise,
      currency: item.currency,
      state: item.order_paid ? "PAID" : "FAILED",
      attemptedAt: item.attempted_at,
    })),
    skipDuplicates: true,
  });

  const existingInitialAudits = await prisma.auditEvent.findMany({
    where: {
      caseId: { in: recoveryCases.map((item) => item.id) },
      sequenceNumber: 1,
    },
    select: { caseId: true },
  });
  const auditedCaseIds = new Set(existingInitialAudits.map((item) => item.caseId));
  const initialAudits = dataset.cases.flatMap((item) => {
    const caseId = caseIds.get(item.case_id)!;
    if (auditedCaseIds.has(caseId)) return [];

    const timestamp = new Date().toISOString();
    const event = appendAuditEvent([], {
      case_id: caseId,
      sequence_number: 1,
      timestamp,
      actor_type: "SYSTEM",
      actor_id: null,
      event_type: "CASE_IMPORTED",
      input_refs: [item.case_id],
      decision: { state: "DETECTED" },
      reason_codes: ["valid_benchmark_case"],
      policy_snapshot: { version: POLICY_VERSION },
      model_metadata: null,
    });
    return [
      {
        id: event.event_id,
        caseId,
        sequenceNumber: 1,
        timestamp,
        actorType: "SYSTEM" as const,
        eventType: "CASE_IMPORTED",
        inputRefs: [item.case_id],
        decision: { state: "DETECTED" },
        reasonCodes: ["valid_benchmark_case"],
        policySnapshot: { version: POLICY_VERSION },
        previousHash: event.previous_hash,
        eventHash: event.event_hash,
      },
    ];
  });
  if (initialAudits.length > 0) {
    await prisma.auditEvent.createMany({ data: initialAudits, skipDuplicates: true });
  }
  console.log(`Seeded ${dataset.case_count} benchmark cases.`);
}

main().finally(() => prisma.$disconnect());
