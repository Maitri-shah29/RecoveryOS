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
  for (const item of dataset.cases) {
    await prisma.$transaction(async (tx) => {
      const recoveryCase = await tx.recoveryCase.upsert({
        where: { merchantId_externalCaseId: { merchantId: merchant.id, externalCaseId: item.case_id } },
        update: { batchId: batch.id },
        create: {
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
        },
      });
      await tx.paymentAttempt.upsert({
        where: { caseId_attemptNumber: { caseId: recoveryCase.id, attemptNumber: 1 } },
        update: {},
        create: { caseId: recoveryCase.id, attemptNumber: 1, amountPaise: item.amount_paise, currency: item.currency, state: item.order_paid ? "PAID" : "FAILED", attemptedAt: item.attempted_at },
      });
      const auditExists = await tx.auditEvent.findUnique({ where: { caseId_sequenceNumber: { caseId: recoveryCase.id, sequenceNumber: 1 } } });
      if (!auditExists) {
        const timestamp = new Date().toISOString();
        const event = appendAuditEvent([], {
          case_id: recoveryCase.id,
          sequence_number: 1,
          timestamp,
          actor_type: "SYSTEM",
          event_type: "CASE_IMPORTED",
          input_refs: [item.case_id],
          decision: { state: "DETECTED" },
          reason_codes: ["valid_benchmark_case"],
          policy_snapshot: { version: POLICY_VERSION },
          model_metadata: null,
        });
        await tx.auditEvent.create({
          data: {
            id: event.event_id,
            caseId: recoveryCase.id,
            sequenceNumber: 1,
            timestamp,
            actorType: "SYSTEM",
            eventType: "CASE_IMPORTED",
            inputRefs: [item.case_id],
            decision: { state: "DETECTED" },
            reasonCodes: ["valid_benchmark_case"],
            policySnapshot: { version: POLICY_VERSION },
            previousHash: event.previous_hash,
            eventHash: event.event_hash,
          },
        });
      }
    });
  }
  console.log(`Seeded ${dataset.case_count} benchmark cases.`);
}

main().finally(() => prisma.$disconnect());
