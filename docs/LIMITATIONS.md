# Limitations

- All customers, payments, and outcomes are synthetic. The benchmark demonstrates reproducible system behavior, not real-world recovery lift.
- Potential-outcome probabilities are authored assumptions, not merchant data or causal estimates. A favorable held-out result is not evidence of production performance.
- Net recovery depends on illustrative intervention costs. They are shown at 0.5×, 1×, and 2×; they are not empirically validated.
- Planning uses normalized failure categories already present in the input. It does not diagnose unrestricted raw provider text.
- Assisted-review cases remain explicit exceptions requiring an operator decision; the app does not automate those decisions.
- AI planning is optional and credential-dependent. Deterministic fallback behavior is tested; no claim is made about model quality, calibration, or business uplift without an actual configured model evaluation.
- Razorpay support is test-mode only. The client, signature verification, reconciliation, idempotency, and injected failure paths are tested, but no real Razorpay transaction was executed without user-supplied test credentials.
- No real messaging, authentication, multi-tenancy, live payment, subscription recovery, voice recovery, or fraud scoring is present.
- PostgreSQL migrations and Docker Compose are supplied, but production operations, backups, secret management, encryption key management, and scale testing are outside V1.
