# Benchmark methodology

## Version and split

`recoveryos-benchmark-v1.0.0` contains exactly 180 synthetic cases: 60 development, 20 validation, and a frozen 100-case held-out set. Headline metrics use only held-out cases. The held-out case array has SHA-256 checksum:

```text
0124a44136ad7b96a53d6760ab877bfd654faf618b0895706b18aa2674c23c13
```

Every policy record repeats this checksum. Frozen plans also carry their own checksum, which the evaluator verifies before scoring.

## Separation and freeze order

1. The generator writes agent-visible case features to `fixtures/public/recovery-cases-v1.0.0.json`.
2. It writes probabilities, HMAC-derived draws, and realized outcomes only to `fixtures/evaluator/potential-outcomes-v1.0.0.json`.
3. The deterministic planner creates all four held-out plan files without importing the evaluator fixture.
4. Plan checksums are frozen.
5. The evaluator reveals only the potential outcome matching each selected action and delay.

Tests fail if hidden field names appear in the public case fixture. Re-running evaluation from the committed dataset, plans, fixture, and seed must produce a canonically byte-identical report.

## Published generator

The seed is `recoveryos-v1-public-seed-2026` (identifier `sha256:585f252c7c571cd3ea866c185abac0d2e8cd2b6831787c7e6d04edce03764f74`). A deterministic draw is the leading 52-bit fraction of:

```text
HMAC-SHA256(seed, case_id | action | delay_minutes)
```

The published probability rules live in `publishedRecoveryProbability` in `lib/benchmark/generator.ts`. Natural recovery varies by failure category. Action effects intentionally differ: retry invitation is strongest for transient failures, reminders for abandoned/insufficient-funds cases, fresh checkout for authentication/method failures, and assisted review for uncertain/high-value cases. Immediate intervention has a small penalty, 30 minutes a benefit, 12 hours a smaller contextual benefit, and 24 hours a penalty. Repeated attempts reduce response. Ineligible contacts have no intervention uplift. Therefore no action is universally optimal, and ineffective/harmful interventions exist.

## Policies

1. No intervention: choose `NO_ACTION`.
2. Reminder everyone immediately: propose an immediate reminder for every case.
3. Fixed rule: propose one reminder after 30 minutes.
4. RecoveryOS: select the least intrusive category-specific action and delay.

All proposals go through the identical deterministic policy engine. “Reminder everyone” therefore measures an aggressive strategy without authorizing unsafe contact: blocked cases receive `NO_ACTION` and are counted in its blocked metric.

## Attribution and costs

A simulated recovery counts only when the selected potential outcome is successful within 48 hours. The amount comes from the original case. Each case is scored once per policy, so double attribution is impossible and asserted as zero.

Illustrative costs are assumptions: no action ₹0, reminder ₹1, retry invitation ₹1, fresh checkout link ₹2, and assisted review ₹50. The report includes 0.5×, 1×, and 2× sensitivity values. Gross recovery is the simulator output; net recovery is conditional on these assumptions.

## Reproducibility commands

```bash
npm run dataset:generate
npm run benchmark
npm run benchmark:verify
```

The frozen V1 dataset must not be edited after observing results. Any correction requires a new dataset version, new checksums, and disclosure.
