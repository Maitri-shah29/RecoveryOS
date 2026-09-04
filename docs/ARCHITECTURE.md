# Architecture

## Current V1 flow

```text
CSV/JSON import ──> deterministic eligibility ──> AI planner or safe fallback
                                                   │
                                                   v
                                      policy gate + frozen plan
                                        │                    │
                              benchmark executor       proof approval
                                        │                    │
                             evaluator-only outcome     test Payment Link
                                        │                    │
                               simulated report       signed webhook +
                                                     API payment fetch
```

The planner accepts `BenchmarkCase` and returns a closed `FrozenPlan`. That type has no probability, random draw, or realized-outcome field. Only `lib/benchmark/evaluator.ts` and the benchmark runner receive the evaluator fixture. The dashboard reads the completed report; it does not evaluate or mutate cases.

## State ownership

- `lib/domain`: source of truth for recovery/payment transitions, money-safe policy rules, mandatory stopping reasons, and action idempotency keys. It imports neither UI nor evaluator code.
- `lib/ai`: typed OpenAI Responses planner. Eligibility runs first, input is allow-listed, output is closed-schema, and two failures select the deterministic fallback.
- `lib/benchmark/planner.ts`: deterministic benchmark/fallback planner. It cannot access evaluator-only data.
- `lib/benchmark/evaluator.ts`: the only application module that joins frozen plans to potential outcomes.
- `lib/services`: transactional import, planning, approval, execution, reconciliation, evaluation, and exception workflows.
- `lib/razorpay`: test-only Payment Link client, raw-body signature verification, payment fetch, and pure reconciliation rules.
- `prisma`: PostgreSQL schema and migration constraints. Payment truth and recovery workflow state are separate columns.
- `app/api`: idempotent mutation and read APIs. `app` and `components` provide benchmark, queue, case, policy, exception, and failure-lab screens.

## Database backstops

The migration enforces unique merchant/case identity, global action idempotency keys, webhook event deduplication, audit sequence uniqueness, payment attribution uniqueness, one frozen plan key, one active proof link per case, and one open escalation per case/reason. Check constraints keep money non-negative and INR-only. Triggers prevent audit mutation, terminal payment regression, and new actions on terminal recovery cases.

The seed imports each case, payment attempt, and genesis audit event in one database transaction. State-changing services persist state plus audit append transactionally. API idempotency records preserve the original status/body on replay.

## Mode boundary

Benchmark execution advances a virtual clock and writes a simulated inbox; it has no Razorpay or messaging path. Proof execution requires an individual operator approval, test credentials, a fresh same-transaction policy check, and at most three links. Only a unique captured payment attribution verified from Razorpay API truth changes recovery to `RECOVERED`. The dashboard and APIs preserve distinct labels and totals for the two modes.
