import type { Prisma } from "@prisma/client";
import { buildAuditEvent } from "./chain";
import { POLICY_VERSION } from "@/lib/domain/policy";

export type AuditAppend = {
  actorType?: "SYSTEM" | "AI" | "OPERATOR" | "CUSTOMER" | "RAZORPAY";
  actorId?: string | null;
  eventType: string;
  inputRefs?: string[];
  decision: Prisma.InputJsonValue;
  reasonCodes: string[];
  policySnapshot?: Prisma.InputJsonValue;
  modelMetadata?: Prisma.InputJsonValue;
  timestamp?: Date;
};

export async function appendCaseAudit(tx: Prisma.TransactionClient, caseId: string, input: AuditAppend) {
  const previous = await tx.auditEvent.findFirst({ where: { caseId }, orderBy: { sequenceNumber: "desc" } });
  const timestamp = input.timestamp ?? new Date();
  const event = buildAuditEvent(previous ? {
    case_id: caseId,
    sequence_number: previous.sequenceNumber,
    event_hash: previous.eventHash,
  } : null, {
    case_id: caseId,
    timestamp: timestamp.toISOString(),
    actor_type: input.actorType ?? "SYSTEM",
    // Prisma persists an omitted nullable scalar as null. Hash the durable
    // representation so an event verifies identically after a DB round trip.
    actor_id: input.actorId ?? null,
    event_type: input.eventType,
    input_refs: input.inputRefs ?? [],
    decision: input.decision,
    reason_codes: input.reasonCodes,
    policy_snapshot: input.policySnapshot ?? { version: POLICY_VERSION },
    model_metadata: input.modelMetadata ?? null,
  });
  return tx.auditEvent.create({ data: {
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
  } });
}
