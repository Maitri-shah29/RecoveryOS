import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { planBatch } from "@/lib/services/planning";
import { advanceBenchmarkClock } from "@/lib/services/benchmark-executor";
import { persistCommittedEvaluation } from "@/lib/services/evaluations";

process.env.OPENAI_API_KEY = "";
process.env.OPENAI_MODEL = "";

const batch = await prisma.batch.findFirst({ where: { mode: "BENCHMARK", state: "IMPORTED" } });
assert(batch, "A freshly seeded benchmark batch is required.");
const startedAt = performance.now();
const planned = await planBatch(batch.id, `prepare-plan-${randomUUID()}`);
const planningDurationMs = Math.round(performance.now() - startedAt);
assert(planningDurationMs < 60_000, `Planning exceeded 60 seconds: ${planningDurationMs}ms.`);
const advanced = await advanceBenchmarkClock(new Date("2026-01-18T12:00:00.000Z"), `prepare-clock-${randomUUID()}`);
const evaluation = await persistCommittedEvaluation(batch.id, `prepare-evaluation-${randomUUID()}`);
console.log(JSON.stringify({
  planning_duration_ms: planningDurationMs,
  plan: planned.body,
  clock: advanced.body,
  evaluation_id: (evaluation.body as Record<string, unknown>).evaluation_id,
  proof_records_created: 0,
}, null, 2));
await prisma.$disconnect();
