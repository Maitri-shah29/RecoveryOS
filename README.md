# RecoveryOS

**A policy-controlled AI agent for recovering failed checkout revenue—measured against reproducible baselines and verified with Razorpay Test Mode.**

[Live demo](https://recoveryos-ruby.vercel.app) · [Five-minute walkthrough](docs/DEMO.md) · [Benchmark methodology](docs/BENCHMARK.md) · [Architecture](docs/ARCHITECTURE.md)

RecoveryOS was built for **Track 03: AI Revenue Recovery**. It detects failed-payment revenue at risk, selects a bounded intervention, applies deterministic safety gates, executes an auditable recovery workflow, and measures the result. The model may propose; only the policy engine may authorize.

> **Honest-results boundary:** all batch figures below are deterministic results from a versioned synthetic simulator, not production merchant uplift. The ₹125 provider proof is a separate Razorpay Test Mode transaction and is never added to simulated recovery.

## Results at a glance

| Evidence | Result |
|---|---:|
| Frozen held-out evaluation | 100 cases · ₹277,950 simulated revenue at risk |
| RecoveryOS net simulated recovery | **₹136,161** |
| Incremental net vs. fixed-rule baseline | **₹11,044** |
| Contacted cases | 20 / 100 |
| Unauthorized contacts | **0** |
| Explicit unresolved exceptions | 9 |
| Razorpay provider proof | **1 captured Test Mode payment · ₹125** |

The benchmark report is generated—not typed into the dashboard. A fixed seed produces 180 public cases (60 development, 20 validation, 100 held out), separate evaluator-only potential outcomes, frozen plans for four policies, and a canonical JSON report. Re-running the pipeline must reproduce the committed bytes exactly.

## Why this meets the track

RecoveryOS closes the loop instead of stopping at detection:

1. **Detect:** import failed-checkout cases with payment state, failure category, consent, risk, and attempt history.
2. **Decide:** select no action, reminder, retry invitation, fresh checkout link, or assisted review.
3. **Constrain:** recheck consent, quiet hours, contact caps, payment truth, risk blocks, duplicate actions, and stopping rules.
4. **Execute:** use a simulated inbox in benchmark mode or an individually approved Razorpay Test Payment Link in proof mode.
5. **Verify:** count money only from frozen evaluator truth or an API-verified captured Razorpay payment—not from a browser callback.
6. **Measure:** compare the same held-out cases across no intervention, reminder-everyone, fixed-rule, and RecoveryOS policies.
7. **Explain:** preserve every decision, action, webhook, attribution, stop, and escalation in a hash-chained audit trail.

## System design

```text
CSV / JSON cases
       │
       ▼
Eligibility + payment-state checks
       │
       ▼
Typed AI planner ── two failures ──► deterministic fallback
       │
       ▼
Deterministic policy gate + frozen plan
       │
       ├── BENCHMARK ──► virtual clock ──► evaluator-only outcomes ──► simulated report
       │
       └── RAZORPAY_PROOF ──► operator approval ──► test link ──► signed webhook
                                                               + provider API truth
                                                                       │
                                                                       ▼
                                                              verified attribution
```

The modes are structurally separated. Benchmark execution cannot call Razorpay or messaging networks. Proof mode cannot contribute to benchmark totals and fails closed without test credentials, consent, a valid signature, and captured provider truth.

## Product surfaces

- **Executive overview:** headline evidence, integrity checks, recovery curve, and separate proof card.
- **Policy comparison:** recovery by policy, failure category, action, and illustrative cost sensitivity.
- **Recovery queue:** filters by workflow state, mode, diagnosis, action, confidence, and escalation.
- **Case timeline:** payment truth, frozen plan, reason codes, approvals, actions, webhooks, attribution, and audit export.
- **Policy configuration:** immutable policy versions with safe defaults.
- **Exceptions:** explicit operator-owned resolution and dismissal workflow.
- **Failure lab:** duplicate webhook, out-of-order event, invalid signature, model fallback, database constraint, and trigger demonstrations.

## Technology

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- PostgreSQL with Prisma and database-level invariants
- OpenAI Responses API with closed-schema output and deterministic fallback
- Razorpay Payment Links, signed webhooks, and payment API reconciliation—Test Mode only
- Vitest for domain and integration tests; Playwright for browser acceptance tests
- Vercel deployment with Neon PostgreSQL

## Quick start

### Deterministic benchmark only

No database, OpenAI key, or Razorpay credentials are required.

```bash
npm ci
npm run dataset:generate
npm run benchmark
npm run benchmark:verify
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The generated report is written to [`reports/heldout-v1.0.0.json`](reports/heldout-v1.0.0.json).

### Full local application

Prerequisites: Node.js 22+, npm 11+, Docker Desktop with Compose, and Playwright Chromium.

```bash
npm ci
copy .env.example .env.local
docker compose up -d postgres
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run verify
npx playwright install chromium
npm run test:e2e
npm run dev
```

On macOS/Linux, replace `copy` with `cp`.

## Environment variables

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Persisted product workflow | PostgreSQL connection string |
| `OPENAI_API_KEY` | Optional AI planning | Leave empty to test deterministic fallback |
| `OPENAI_MODEL` | Optional AI planning | Explicit model identifier paired with the API key |
| `RAZORPAY_KEY_ID` | Proof mode | Must begin with `rzp_test_`; live keys are rejected |
| `RAZORPAY_KEY_SECRET` | Proof mode | Server-side secret; never expose to the browser |
| `RAZORPAY_WEBHOOK_SECRET` | Proof reconciliation | Verifies the raw webhook body signature |
| `APP_BASE_URL` | Proof callback | Public origin locally or on Vercel |
| `BENCHMARK_SEED` | Dataset generation | Frozen V1 value is documented in `.env.example` |

Copy [`.env.example`](.env.example) and keep secrets out of Git. The deterministic benchmark deliberately runs without external credentials.

For the deployed proof, configure the Razorpay Test Mode webhook as:

```text
https://recoveryos-ruby.vercel.app/api/razorpay/webhook
```

Enable `payment.authorized` and `payment.captured`. Never import a local database URL over Vercel-provisioned database variables.

## Verification commands

| Command | What it proves |
|---|---|
| `npm run verify` | Regenerates data/report, verifies byte reproducibility, runs unit tests and type checking, then builds production |
| `npm run benchmark:verify` | Frozen plans reproduce the committed canonical report |
| `npm test` | State machines, policy rules, audit chains, idempotency, benchmark separation, AI fallback, and Razorpay reconciliation |
| `npm run test:database` | Persisted benchmark/proof smoke story against seeded PostgreSQL |
| `npm run test:acceptance` | Terminal states, policy links, mode separation, audit integrity, and all four outcomes |
| `npm run test:integrations` | One constrained OpenAI request plus Razorpay test credential validation; creates no link |
| `npm run test:proof:live` | Explicitly authorized re-verification of captured proof, attribution, provider truth, and audit chain |
| `npm run test:e2e` | Chromium coverage of the dashboard, operational pages, and failure lab |

## Reproducible benchmark

- Dataset version: `recoveryos-benchmark-v1.0.0`
- Split: 60 development / 20 validation / 100 held out
- Held-out SHA-256: `0124a44136ad7b96a53d6760ab877bfd654faf618b0895706b18aa2674c23c13`
- Policies: no intervention, reminder everyone, fixed rule, RecoveryOS
- Frozen evaluation window: 48 virtual hours
- Declared 1× costs: no action ₹0, reminder/retry ₹1, fresh link ₹2, assisted review ₹50

Potential-outcome probabilities and costs are published assumptions—not merchant data or causal estimates. See [the complete methodology](docs/BENCHMARK.md), [limitations](docs/LIMITATIONS.md), and the [machine-readable report](reports/heldout-v1.0.0.json).

## Five-minute demo

1. Start at the [executive overview](https://recoveryos-ruby.vercel.app) and establish the honest simulation/Test Mode boundary.
2. Open the verified proof case to show `CAPTURED / RECOVERED`, signature-valid webhook evidence, API attribution, and the audit chain.
3. Run the Failure Lab to demonstrate safe behavior under duplicate, late, invalid, and unavailable inputs.
4. Open Comparison to show one checksum across all four policies and the ₹11,044 incremental result.
5. Finish with Exceptions and an exported audit trail, then state the production limitations.

The timestamped narration and exact clicks are in [docs/DEMO.md](docs/DEMO.md). Provider evidence is documented in [docs/PROOF.md](docs/PROOF.md).

## Safety and engineering decisions

- Integer paise for all money; UTC for all internal timestamps.
- Pure, tested payment and recovery state machines reject illegal transitions.
- Idempotency is enforced in application code and PostgreSQL constraints.
- State changes and audit events commit in the same transaction.
- Evaluator-only outcomes cannot enter planner types, prompts, APIs, or logs.
- Browser callbacks never count as payment evidence.
- Proof mode allows Test Mode credentials only and requires per-case approval.
- Uncertain or unsafe cases stop or escalate; they are never silently counted as recovered.

Read [docs/SAFETY.md](docs/SAFETY.md) for the complete guardrail model and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for state ownership and database backstops.

## Scope and limitations

V1 focuses on failed-checkout recovery. Authentication, multi-tenancy, real customer messaging, live-money payments, subscription recovery, voice, fraud scoring, production operations, and causal lift validation are intentionally outside the locked PRD scope. They are not represented as completed features.

The source of truth is [`RecoveryOS-PRD.md`](RecoveryOS-PRD.md), with Section 31 as the authoritative implementation contract.

## Repository evidence map

| Question a reviewer may ask | Evidence |
|---|---|
| Where do the displayed figures come from? | [`scripts/run-benchmark.ts`](scripts/run-benchmark.ts), [`lib/benchmark/evaluator.ts`](lib/benchmark/evaluator.ts), and the generated report |
| Are outcomes hidden from the planner? | [`lib/benchmark/planner.ts`](lib/benchmark/planner.ts) and [architecture notes](docs/ARCHITECTURE.md) |
| Can the result be reproduced? | [`scripts/verify-benchmark.ts`](scripts/verify-benchmark.ts) and benchmark tests |
| Are unsafe contacts blocked? | [`lib/domain/policy.ts`](lib/domain/policy.ts) and [safety documentation](docs/SAFETY.md) |
| Is payment truth provider-verified? | [`lib/razorpay`](lib/razorpay), webhook route, proof tests, and [proof evidence](docs/PROOF.md) |
| Can actions be reconstructed? | Prisma audit entities, service transactions, and per-case audit export |

## Final submission claim

> RecoveryOS processed **100 held-out failed-payment cases** representing **₹277,950 in simulated revenue at risk**. It recovered **₹136,161 simulated net of intervention cost**, an incremental **₹11,044 over the fixed-rule baseline**, while producing **zero unauthorized contacts**, respecting all stopping rules, and escalating **9 unresolved cases**. Separately, **one ₹125 Razorpay Test Mode payment** was recovered and verified through signed, idempotent webhook processing and provider API truth.

---

Built as an auditable revenue-recovery system: AI for judgment, deterministic code for permission, and provider truth for money.
