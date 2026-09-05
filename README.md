# RecoveryOS

RecoveryOS V1 is a failed-checkout recovery control plane with two strictly separated modes. Benchmark mode evaluates four policies against a frozen synthetic held-out set and never calls payment or messaging networks. Razorpay proof mode can create an explicitly approved **test-mode** Payment Link and counts recovery only after signed webhook receipt plus API-verified captured payment truth.

The repository includes the Section 31 deterministic foundation and the remaining in-scope V1 workflow: PostgreSQL-backed import/planning/execution, typed AI planning with a deterministic two-failure fallback, approval and exception handling, Razorpay test adapter/reconciliation, append-only audit export, failure lab, operational screens, and browser tests. Authentication, real messaging, subscriptions, voice, live payments, and fraud scoring remain intentionally absent.

## Prerequisites

- Node.js 22+
- npm 11+
- Docker Desktop with Docker Compose (for PostgreSQL)
- Playwright Chromium (`npx playwright install chromium`)

## Fresh-clone setup

```bash
npm install
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

On macOS/Linux, replace `copy` with `cp`. Open [http://localhost:3000](http://localhost:3000). `npm run verify` regenerates the dataset, freezes all plans, evaluates the held-out batch, checks byte reproducibility, runs unit tests and type checking, and builds the production dashboard.

PostgreSQL and external credentials are not needed for the deterministic benchmark itself:

```bash
npm run dataset:generate
npm run benchmark
npm run benchmark:verify
npm test
npm run dev
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dataset:generate` | Recreate the 180 public cases and separate 4,500-row evaluator fixture |
| `npm run benchmark` | Freeze four policy plan files and write held-out JSON reports |
| `npm run benchmark:verify` | Re-evaluate frozen plans and require canonical byte equivalence |
| `npm test` | Run deterministic domain, policy, audit, idempotency, and benchmark tests |
| `npm run test:database` | Run the persisted benchmark/proof smoke story against a freshly seeded database |
| `npm run test:acceptance` | Verify all persisted audit chains, held-out terminal states, action-policy links, mode separation, and four-policy outcomes |
| `npm run test:integrations` | Make one schema-constrained OpenAI request and validate the Razorpay test credentials without creating a Payment Link |
| `npm run test:proof:live` | With an explicit confirmation flag, reverify the latest captured test payment, attribution, provider truth, and audit chain |
| `npm run test:e2e` | Start the app and run the Chromium dashboard/failure-lab suite |
| `npm run typecheck` | Type-check the full application |
| `npm run build` | Build the production Next.js application |
| `npm run db:migrate:deploy` | Apply committed PostgreSQL migrations using `.env.local` |
| `npm run db:seed` | Seed the synthetic merchant, batch, policy, cases, attempts, and genesis audit events |
| `npm run db:reset:synthetic` | Guarded reset of only the locked synthetic merchant; requires `CONFIRM_SYNTHETIC_RESET=RecoveryOS Synthetic Merchant` |
| `npm run db:prepare:demo` | Prepare deterministic persisted benchmark/evaluation evidence without creating proof records or external calls |

## Environment

`.env.example` contains safe placeholders for the locked environment contract. Keep OpenAI values empty to exercise deterministic fallback. To enable model planning, set both `OPENAI_API_KEY` and an explicit `OPENAI_MODEL`; responses are closed-schema, do not store provider-side state, and receive only allow-listed evidence.

Proof mode remains disabled unless every Razorpay variable is present and `RAZORPAY_KEY_ID` starts with `rzp_test_`. Live keys are rejected. `APP_BASE_URL` is used only for the proof callback URL; a browser callback never counts as recovery. Changing the benchmark seed creates different fixtures and must not be represented as the frozen V1 result.

For deployed verification, configure the public webhook as `https://recoveryos-ruby.vercel.app/api/razorpay/webhook` in Razorpay Test Mode and enable `payment.authorized` and `payment.captured`. Never import local database credentials over the Vercel-provisioned Neon variables.

## Frozen result

- Dataset: `recoveryos-benchmark-v1.0.0`
- Split: 60 development / 20 validation / 100 held out
- Held-out SHA-256: `0124a44136ad7b96a53d6760ab877bfd654faf618b0895706b18aa2674c23c13`
- Headline label: **Recovered — simulation**
- RecoveryOS net simulated recovery: **₹136,161** under the declared 1× illustrative-cost assumption
- Incremental net versus fixed-rule baseline: **₹11,044**
- Unauthorized contacts: **0**
- Razorpay proof: **1 API-verified Test Mode payment · ₹125**, reported separately

These are controlled simulator results, not production uplift. Razorpay test-mode recovered revenue is displayed separately and is never combined with simulated revenue.

## Evidence and design notes

- [Architecture](docs/ARCHITECTURE.md)
- [Benchmark methodology](docs/BENCHMARK.md)
- [Safety policy](docs/SAFETY.md)
- [Limitations](docs/LIMITATIONS.md)
- [Five-minute demo](docs/DEMO.md)
- [Provider proof evidence](docs/PROOF.md)
- Machine-readable report: [`reports/heldout-v1.0.0.json`](reports/heldout-v1.0.0.json)
- Production demo verification: [`artifacts/demo-verification-v1.0.0.json`](artifacts/demo-verification-v1.0.0.json)

The PRD remains the source of truth. Section 31 is the authoritative kickoff contract.
