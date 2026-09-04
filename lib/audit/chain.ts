import { createHash, randomUUID } from "node:crypto";

export const AUDIT_GENESIS_HASH = "0".repeat(64);

export type AuditEventInput = {
  event_id?: string;
  case_id: string;
  sequence_number: number;
  timestamp: string;
  actor_type: "SYSTEM" | "AI" | "OPERATOR" | "CUSTOMER" | "RAZORPAY";
  actor_id?: string | null;
  event_type: string;
  input_refs: string[];
  decision: unknown;
  reason_codes: string[];
  policy_snapshot: unknown;
  model_metadata?: unknown;
};

export type AuditEvent = AuditEventInput & { event_id: string; previous_hash: string; event_hash: string };

export type PreviousAuditEvent = Pick<AuditEvent, "case_id" | "sequence_number" | "event_hash">;

export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function appendAuditEvent(events: readonly AuditEvent[], input: AuditEventInput): AuditEvent {
  const previous = events.at(-1);
  if (previous && previous.case_id !== input.case_id) throw new Error("Audit chains are per case");
  if (input.sequence_number !== events.length + 1) throw new Error("Audit sequence must be contiguous");
  const previous_hash = previous?.event_hash ?? AUDIT_GENESIS_HASH;
  const event_id = input.event_id ?? randomUUID();
  const body = { ...input, event_id, previous_hash };
  return { ...body, event_hash: createHash("sha256").update(canonicalJson(body)).digest("hex") };
}

export function buildAuditEvent(previous: PreviousAuditEvent | null, input: Omit<AuditEventInput, "sequence_number">): AuditEvent {
  if (previous && previous.case_id !== input.case_id) throw new Error("Audit chains are per case");
  const sequence_number = (previous?.sequence_number ?? 0) + 1;
  const previous_hash = previous?.event_hash ?? AUDIT_GENESIS_HASH;
  const event_id = input.event_id ?? randomUUID();
  const body = { ...input, event_id, sequence_number, previous_hash };
  return { ...body, event_hash: createHash("sha256").update(canonicalJson(body)).digest("hex") };
}

export function verifyAuditChain(events: readonly AuditEvent[]): { valid: boolean; invalidSequence: number | null } {
  let previousHash = AUDIT_GENESIS_HASH;
  for (const [index, event] of events.entries()) {
    const { event_hash, ...body } = event;
    const computed = createHash("sha256").update(canonicalJson(body)).digest("hex");
    if (event.sequence_number !== index + 1 || event.previous_hash !== previousHash || event_hash !== computed) {
      return { valid: false, invalidSequence: event.sequence_number };
    }
    previousHash = event_hash;
  }
  return { valid: true, invalidSequence: null };
}
