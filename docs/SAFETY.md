# Safety policy

## Deterministic gates

Before any contact action, the policy engine requires all of the following: payment/order not already paid, explicit opt-in, non-blocked risk, at least ₹100 at risk, action inside the 48-hour window, fewer than two prior actions, fewer than three contacts in seven days, no action already in flight, and complete/non-contradictory required data. Unknown consent means no consent.

Risk review, confidence below 0.65, or value at/above ₹10,000 routes to assisted review with no customer contact. Quiet hours are 9 PM–9 AM in the customer timezone. An action is deferred to the next permitted time or blocked if that would cross the recovery deadline.

## Stopping behavior

The pure stop evaluator covers captured/paid payment truth, opt-out, newly blocked risk, expired window, exhausted attempts, contact cap, operator stop, and contradictory payment state. Contradiction is an escalation condition, never a guessed recovery.

Payment state and recovery state are independent. Verified payment truth may force recovery to `RECOVERED`; recovery actions cannot rewrite payment truth. Pure transition functions reject illegal movement, and PostgreSQL prevents terminal payment regression and action creation on a terminal recovery case.

## Idempotency and audit

Action idempotency keys are SHA-256 values derived from merchant, case, allow-listed action, and attempt number. PostgreSQL makes the key globally unique. Audit events use canonical, lexicographically key-sorted JSON and a per-case SHA-256 chain with a fixed zero genesis hash. The database rejects audit updates/deletes and duplicate sequence numbers.

## External and prompt boundaries

Benchmark execution contains no Razorpay, email, SMS, WhatsApp, or voice client. Failure descriptions are sanitized evidence and never trusted instructions. Hidden evaluator values are excluded from planner types, public fixtures, dashboard responses, and model prompts.

AI is advisory inside the deterministic boundary: ineligible cases never reach it; output must satisfy a closed schema; an explicit model is required; provider storage is disabled; and two failed attempts select a versioned deterministic fallback. Model output cannot bypass eligibility or policy.

Proof mode fails closed on missing/non-test credentials, invalid signatures, absent consent, unavailable or contradictory payment truth, duplicate active links, or lack of explicit operator approval. Raw webhook bytes are HMAC-verified before parsing. Event IDs and payment IDs are unique, out-of-order events cannot regress terminal truth, and browser callbacks do not count as evidence.
