# Five-minute RecoveryOS demo

Production demo: <https://recoveryos-ruby.vercel.app>

Use the already recovered proof case for a stable presentation. Do not reset the synthetic merchant before the demo; the guarded reset intentionally removes proof evidence.

## Preflight

```powershell
npm run verify
npm run test:acceptance
npm run test:integrations
$env:CONFIRM_RAZORPAY_TEST_PROOF='RecoveryOS Razorpay Test Mode'
npm run test:proof:live
Remove-Item Env:CONFIRM_RAZORPAY_TEST_PROOF
```

Expected proof result: ₹125, payment `CAPTURED`, recovery `RECOVERED`, one attribution, two signature-valid webhooks, and a valid eight-event audit chain.

## 0:00–0:40 — Problem and honest claim

Open the executive overview. Show ₹277,950 at risk across the same frozen 100 held-out cases. State that all headline batch results are controlled simulation, while Razorpay evidence is separately labeled Test Mode.

## 0:40–1:30 — Decision and deterministic control

Open a case from the recovery queue. Show diagnosis, confidence, expected recovery probability, customer-safe explanation, model/prompt/schema versions, reason codes, and the frozen policy-gate result. Emphasize that the model proposes and the deterministic engine authorizes.

## 1:30–2:20 — Real test-mode recovery

From the overview, select **Open verified proof case**, or open:

<https://recoveryos-ruby.vercel.app/cases/36425e4e-bf35-4138-8269-59b967065453>

Show the completed Payment Link action, `CAPTURED / RECOVERED` state, signature-valid webhooks, unique API-verified attribution, original payment evidence, and the valid audit chain. Explain that the browser callback alone cannot recover a case.

## 2:20–3:10 — Failure safety

Open `/failure-lab` and run **Run safe failure fixtures**. All six checks must pass:

1. Duplicate webhook keeps one attribution.
2. Late authorization cannot regress captured truth.
3. Invalid signature is rejected.
4. Two model failures choose the deterministic fallback.
5. Five critical PostgreSQL unique guards are installed.
6. Three immutable/terminal PostgreSQL triggers are installed.

## 3:10–4:15 — Four-policy evidence

Open `/comparison`. The same held-out checksum must appear for all four policies. Highlight:

- RecoveryOS net simulated recovery: ₹136,161
- Incremental net versus fixed rule: ₹11,044
- Unauthorized contacts: 0
- RecoveryOS contacts: 20/100
- Explicit unresolved exceptions: 9

The nine held-out exceptions demonstrate fail-closed behavior; they are not silently counted as recovered. The `/exceptions` operator queue also includes unresolved development-split cases from the full 180-case dataset, and labels each row by split.

## 4:15–5:00 — Audit and limitations

Open `/exceptions`, then one exception. Show the reason, attempted actions, suggested next safe step, and explicit resolve/dismiss controls. Export the case audit JSON and point to its chain-verification result. End by stating that authentication, real messaging, live money, subscriptions, voice, multi-tenancy, and fraud scoring are deliberate post-V1 work.

## Optional live rerun

Only use Razorpay Test Mode. Select one eligible benchmark case for proof mode, plan it, modify to `FRESH_CHECKOUT_LINK` if needed, approve it, and complete Checkout explicitly. RecoveryOS permits no more than three proof cases and links per demo run. The existing verified case is preferred when presentation reliability matters.
