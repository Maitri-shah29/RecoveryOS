# Provider proof evidence

RecoveryOS completed one customer-authorized Razorpay **Test Mode** recovery on September 5, 2026. This is integration evidence, not production revenue and not part of the simulated benchmark totals.

## Verified result

- Label: **Recovered — Razorpay test mode**
- Amount: ₹125 (`12500` paise, INR)
- Case: `proof-case_059-39627dee`
- Payment Link: `plink_TYA43mUWIIFRPx`
- Payment: `pay_TYABwN03tkmbQ5`
- Provider API truth: `captured`
- Signed webhook events: 2
- Unique payment attributions: 1
- Immutable audit events: 8
- Audit chain: valid
- Planner: `openai:gpt-5.4-mini-2026-03-17`
- Application commit at execution: `72efcf7`
- Deployment: `https://recoveryos-ruby.vercel.app`

The browser callback was not used as recovery evidence. Recovery occurred only after raw-body signature verification, a matching reference and amount, and a Razorpay API fetch confirming captured payment truth. No real money was charged.

The machine-readable snapshot is `artifacts/live-proof-v1.0.0.json`.

## Repeat the read-only verification

This command does not create a Payment Link or payment. It loads the latest recovered proof case, verifies its audit chain and database attribution, and performs one read-only Razorpay payment fetch. It rejects live credentials.

PowerShell:

```powershell
$env:CONFIRM_RAZORPAY_TEST_PROOF='RecoveryOS Razorpay Test Mode'
npm run test:proof:live
Remove-Item Env:CONFIRM_RAZORPAY_TEST_PROOF
```

The confirmation is deliberately required so an external provider request is never made accidentally during the deterministic benchmark.
