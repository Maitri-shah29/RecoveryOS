# RecoveryOS — Product Requirements Document

**Track:** 03 — AI Revenue Recovery  
**Version:** 1.1  
**Status:** Approved for implementation; V1 decisions locked  
**Primary use case:** Failed checkout payment recovery  

## 1. Product summary

RecoveryOS is a policy-controlled AI agent that processes a batch of failed checkout payments, diagnoses the likely reason for each failure, selects the safest useful recovery intervention, executes the approved workflow, and measures the money recovered.

The product does not merely flag failures. It closes the loop:

> Detect → diagnose → choose → validate → execute → observe → stop or escalate → measure

The demonstration will combine:

- Razorpay test-mode orders, payments, Payment Links, and signed webhooks for real integration evidence.
- A deterministic batch simulator containing at least 100 synthetic failed-payment cases for repeatable measurement.
- A policy engine that places hard limits around every AI recommendation.
- An append-only audit trail explaining every decision and action.

All reported results must clearly distinguish **test-mode money recovered** from **simulated money recovered**.

## 2. Problem

Merchants lose revenue after failed checkout attempts because recovery is usually generic, delayed, or overly aggressive. A single fixed reminder cannot account for failure reason, order value, customer consent, contact history, retry likelihood, or fraud risk.

Existing dashboards can show that a payment failed. The unresolved problem is deciding what to do next, doing it safely, verifying the outcome, and proving that the intervention produced incremental recovered revenue.

## 3. Target user

### Primary user

An operations or growth manager at a digital merchant who wants to recover failed checkout revenue without manually reviewing every payment.

### Secondary user

A finance or compliance reviewer who needs to understand why an intervention was performed and whether policy limits were followed.

## 4. Product goals

1. Process a frozen held-out batch of at least 100 synthetic failed-payment cases.
2. Produce either one valid recovery action or an explicit, reasoned `NO_ACTION` decision for every case.
3. Execute actions through a bounded workflow.
4. Demonstrate at least one real Razorpay test-mode recovery journey end to end.
5. Measure gross and net recovered revenue against clear baselines.
6. Enforce consent, quiet hours, contact caps, retry limits, and fraud suppression outside the language model.
7. Make every decision reproducible through an audit trail.
8. Handle at least one injected failure gracefully.

### 4.1 Release gates

The submission may be called complete only when:

- 100% of held-out cases end in a terminal state or the explicit unresolved-exception queue;
- unauthorized contacts equal **0**;
- duplicate external actions equal **0**;
- successful-payment double attribution equals **0**;
- audit-chain verification passes for **100%** of cases;
- all four evaluation policies run on the identical held-out dataset checksum;
- the Razorpay proof flow passes once end to end and the required injected failure passes;
- RecoveryOS's held-out incremental net recovery versus the fixed-rule baseline is reported honestly, even if it is zero or negative.

No target recovery percentage is specified in advance because inventing a favorable threshold would encourage tuning the benchmark to the claim.

## 5. Non-goals for version 1

- Charging a customer automatically.
- Handling live money or production credentials.
- Predicting or detecting fraud as a primary product.
- Full subscription, mandate, invoice, or collections recovery.
- Sending real WhatsApp, SMS, or voice messages.
- Claiming simulated results as production revenue.
- Allowing the language model to bypass policy or call Razorpay directly.

## 5.1 Operating modes

RecoveryOS has two deliberately separate modes:

1. **Benchmark mode:** Runs all synthetic cases against a virtual clock and simulated inbox. It never calls Razorpay or an external messaging provider. It may auto-execute actions because they have no external effect.
2. **Razorpay proof mode:** Runs a maximum of three manually selected test cases. Creating a Payment Link requires operator approval and calls Razorpay test-mode APIs. The customer still authorizes payment in Checkout.

The UI, database, exports, and metrics must retain the mode on every case and action. Benchmark actions must never be replayed into proof mode automatically.

## 6. Core proposition

For each failed payment, RecoveryOS answers four questions:

1. **What probably happened?**
2. **Is recovery contact permitted and worthwhile?**
3. **What is the least intrusive intervention likely to work?**
4. **When must the system stop or request human review?**

## 7. Supported recovery actions

| Action | Purpose | Execution |
|---|---|---|
| No action | Suppress unsafe, low-value, opted-out, or exhausted cases | Record reason and stop |
| Retry invitation | Wait when the failure appears transient | Schedule one bounded invitation to try checkout again |
| Fresh checkout link | Offer another customer-authorized attempt | Create a Razorpay test-mode Payment Link in proof mode, or simulate it in benchmark mode |
| Assisted recovery | Ask a human operator to review uncertainty | Create an internal escalation task |
| Reminder | Recover a likely abandoned but eligible attempt | Place message in the simulated customer inbox |

RecoveryOS never completes a payment on the customer's behalf. The customer must open Razorpay Checkout and explicitly authorize payment.

## 8. End-to-end user flow

### 8.1 Merchant setup

1. Merchant opens the dashboard.
2. Merchant configures policy:
   - maximum recovery attempts;
   - minimum recoverable amount;
   - quiet hours;
   - recovery window;
   - contact channel consent requirements;
   - escalation threshold.
3. Merchant imports the supplied 100-case dataset or starts a demo batch.

### 8.2 Batch recovery

1. The ingestion service validates and normalizes each record.
2. Deterministic eligibility rules remove cases that must not be contacted.
3. The AI produces a structured diagnosis and proposed intervention for eligible cases.
4. The policy engine validates the proposal.
5. Invalid or uncertain proposals are suppressed or escalated.
6. Approved actions are scheduled and executed against a virtual clock in benchmark mode.
7. The simulator reveals the pre-generated deterministic outcome for the selected action and delay bucket.
8. Razorpay webhooks update real test-mode cases.
9. The system stops completed or exhausted workflows.
10. The dashboard displays recovered revenue, policy decisions, baselines, and exceptions.

### 8.3 Single-case recovery

1. Operator opens a failed-payment case.
2. Timeline shows original attempt, diagnosis, policy checks, and recommended action.
3. Operator can approve, reject, or modify an action when manual approval is required.
4. RecoveryOS creates a test-mode Payment Link with a unique reference.
5. Customer completes or fails the test payment.
6. Signed webhook updates the case.
7. RecoveryOS marks the case recovered and cancels pending actions.

## 9. Input data

Each synthetic case contains:

| Field | Description |
|---|---|
| `case_id` | Stable unique case identifier |
| `customer_id` | Synthetic customer identifier |
| `order_id` | Merchant order identifier |
| `razorpay_payment_id` | Optional test-mode payment ID |
| `amount_paise` | Amount at risk in paise |
| `currency` | `INR` in version 1 |
| `failure_code` | Normalized failure category |
| `failure_description` | Sanitized provider message |
| `payment_method` | Card, UPI, netbanking, wallet, etc. |
| `attempted_at` | Attempt timestamp |
| `customer_segment` | New, returning, high-value, unknown |
| `prior_attempts` | Number of payment attempts for the order |
| `recovery_contacts_7d` | Recent recovery-contact count |
| `consent_status` | Opted-in, opted-out, unknown |
| `risk_flag` | Clear, review, blocked |
| `preferred_channel` | In-app or email simulator |
| `customer_timezone` | IANA timezone used to enforce quiet hours |
| `simulation_profile_id` | Opaque reference to hidden potential outcomes used only by the evaluator |

No real customer personal data is required.

## 10. Failure taxonomy

Version 1 supports these normalized categories:

- transient bank or network failure;
- insufficient funds;
- authentication not completed;
- customer abandoned checkout;
- payment method unavailable;
- duplicate or already-paid order;
- suspected risk or policy block;
- unknown technical failure.

The raw failure message is treated as evidence, not as trusted instructions.

## 11. AI responsibilities

The model may:

- classify the likely failure cause from sanitized evidence;
- summarize the customer journey;
- estimate recovery likelihood using provided features;
- recommend one action from an allow-list;
- provide a short customer-safe explanation;
- state uncertainty and request escalation.

The model must return structured output:

```json
{
  "diagnosis": "transient_failure",
  "confidence": 0.84,
  "recommended_action": "RETRY_INVITATION",
  "recommended_delay_minutes": 30,
  "expected_recovery_probability": 0.42,
  "reason_codes": ["network_error", "first_attempt"],
  "customer_message": "Your payment did not complete. You can safely try again using this link.",
  "requires_human_review": false
}
```

The JSON schema uses closed enums:

- `diagnosis`: `TRANSIENT`, `INSUFFICIENT_FUNDS`, `AUTHENTICATION_INCOMPLETE`, `ABANDONED`, `METHOD_UNAVAILABLE`, `ALREADY_PAID`, `RISK_BLOCKED`, `UNKNOWN`
- `recommended_action`: `NO_ACTION`, `REMINDER`, `RETRY_INVITATION`, `FRESH_CHECKOUT_LINK`, `ASSISTED_REVIEW`
- `confidence`: number from `0` through `1`
- `recommended_delay_minutes`: one of `0`, `30`, `120`, `720`, `1440`

Unknown fields, invalid enums, or missing required fields cause schema rejection and deterministic fallback. Free-form model output is never executed.

The model may not:

- charge, refund, or capture money;
- create arbitrary actions;
- change policy limits;
- access API secrets or raw webhook secrets;
- contact an opted-out customer;
- decide that a signed webhook is authentic;
- mark revenue as recovered without verified evidence.

## 12. Deterministic policy engine

The policy engine runs after every AI recommendation and before every action.

### 12.1 Eligibility gates

A case is ineligible when any condition is true:

- payment is already captured or order is already paid;
- consent is not explicitly opted in;
- risk status is blocked;
- amount is below the configured minimum;
- recovery window has expired;
- maximum attempts have been reached;
- a recovery action for the same case is already in flight;
- required data is missing or contradictory.

### 12.2 Default limits

- Maximum recovery actions per order: **2**
- Maximum recovery contacts per customer in seven days: **3**
- Recovery window: **48 hours** after the original attempt
- Quiet hours: **9:00 PM–9:00 AM customer local time**
- Minimum amount: **₹100**
- Human review when AI confidence is below **0.65**
- Payment Link expiry: **24 hours**
- Only one active Payment Link per order
- High-value human-review threshold: **₹10,000**
- Real test-mode Payment Links created per demo run: **maximum 3**

### 12.3 Mandatory stopping rules

Stop immediately when:

- a signed webhook verifies successful payment;
- the order is found already paid during API verification;
- the customer opts out;
- risk status changes to blocked;
- the recovery window expires;
- maximum attempts or contact cap is reached;
- the operator manually stops the workflow;
- webhook and API states remain contradictory after reconciliation.

Contradictory payment state must be escalated, never guessed.

Quiet hours do not permanently stop a case: they defer the action to the next permitted time, unless that time falls outside the recovery window, in which case the case expires. Consent status `unknown` is treated as no consent, not as implied permission.

## 13. Compliant escalation

In this PRD, “compliant” means compliance with the product's declared consent, contact, privacy, and escalation policy. It is not a claim of legal or regulatory certification. Production deployment would require merchant-specific legal and channel-policy review.

Escalation creates an internal review item containing:

- case and order IDs;
- amount at risk;
- sanitized failure evidence;
- AI diagnosis and confidence;
- policy checks;
- actions already attempted;
- reason human review is required;
- suggested next safe step.

Cases requiring escalation include:

- suspected fraud or abuse;
- contradictory payment states;
- two exhausted recovery attempts;
- low-confidence diagnosis;
- customer complaint;
- amount above the configurable high-value threshold;
- repeated webhook signature failures crossing the configured security-alert threshold.

No further customer contact occurs while a case is escalated.

A single invalid webhook signature is rejected and recorded as a security audit event; it does not create or mutate a customer recovery case. This avoids an attacker generating unlimited case escalations.

## 14. Audit trail

Every transition creates an append-only audit event:

| Field | Description |
|---|---|
| `event_id` | Unique event ID |
| `case_id` | Associated recovery case |
| `timestamp` | Server timestamp |
| `actor_type` | System, AI, operator, customer, Razorpay |
| `actor_id` | Actor identifier when applicable |
| `event_type` | Diagnosis, policy check, action, webhook, stop, escalation |
| `input_refs` | References to sanitized evidence |
| `decision` | Proposed or executed decision |
| `reason_codes` | Machine-readable explanation |
| `policy_snapshot` | Policy version used for the decision |
| `model_metadata` | Model and prompt version, if AI was involved |
| `previous_hash` | Hash of the previous audit event |
| `event_hash` | Hash of the canonical current event |

The hash chain is maintained per recovery case. Canonical JSON with lexicographically sorted keys is hashed using SHA-256. The first event uses a fixed genesis value; each later event stores the prior event hash. Appends occur in one database transaction with a unique `(case_id, sequence_number)` constraint. The UI must provide a human-readable timeline, a chain-verification result, and raw JSON export. Audit records cannot be edited from the product.

## 15. Measurement methodology

### 15.1 Primary metric

**Incremental net recovered revenue**

```text
Net recovered revenue = recovered order value − intervention cost − duplicate/incorrect recovery cost

Incremental net recovered revenue = agent net recovered revenue − baseline net recovered revenue
```

### 15.2 Supporting metrics

- Gross revenue at risk
- Gross revenue recovered
- Recovery rate by value
- Recovery rate by case count
- Net recovery after intervention cost
- Unnecessary-contact rate
- Policy-block rate
- Escalation rate
- Duplicate-action count
- Unauthorized-contact count
- Time to recovery
- Calibration error between predicted and observed recovery probability
- Unresolved exception count

### 15.3 Illustrative intervention costs

The benchmark uses visible, configurable—not empirically claimed—operational costs:

| Action | Default illustrative cost |
|---|---:|
| No action | ₹0.00 |
| Reminder | ₹1.00 |
| Retry invitation | ₹1.00 |
| Fresh checkout link | ₹2.00 |
| Assisted review | ₹50.00 |

The dashboard must label these values as assumptions and provide a sensitivity view at 0.5×, 1×, and 2× cost. Gross recovered revenue remains the primary factual simulator output; net recovery is conditional on these declared assumptions.

### 15.4 Required baselines

The same frozen test batch is evaluated against:

1. **No intervention**
2. **Reminder everyone immediately**
3. **Fixed rule:** one reminder after 30 minutes
4. **RecoveryOS policy**

Each policy receives the same cases and deterministic outcome seed. The dashboard must show both gross recovery and contact/intervention cost so aggressive policies do not appear artificially superior.

### 15.5 Dataset split

- Development set: 60 cases
- Validation set: 20 cases
- Frozen held-out final set: 100 cases

The dataset therefore contains 180 cases. Final headline metrics come only from the frozen 100-case held-out set. Hidden potential outcomes are unavailable to the agent and must live in a separate evaluator-only fixture that the application planning path cannot read.

### 15.6 Counterfactual outcome simulator

For every case, action, and delay bucket, the dataset generator creates a hidden potential outcome using a published ruleset and a deterministic pseudorandom value derived from:

```text
HMAC-SHA256(benchmark_seed, case_id | action | delay_bucket)
```

This permits paired comparison: every policy is evaluated against the same potential outcomes, including a natural-recovery outcome for `NO_ACTION`. The generator publishes feature distributions, action-effect rules, cost assumptions, seed, and dataset checksum. It must not simply define RecoveryOS as the winning policy; at least one segment must favor each reasonable baseline/action, and ineffective or harmful interventions must exist.

The evaluator reveals only the outcome corresponding to the policy's chosen action. Final agent plans are frozen before held-out outcomes are scored. Re-running the evaluator with the same dataset version, plan file, and seed must return byte-identical result JSON.

The agent must not have access to hidden probabilities, pseudorandom values, or sampled outcomes. The repository must include a short simulator limitations document stating that this proves system behavior on a controlled benchmark, not real-world uplift.

### 15.7 Attribution rules

A case counts as recovered only when all of the following hold:

- the outcome occurs inside the 48-hour recovery window;
- amount and currency match the original case;
- order or recovery reference matches the case;
- the payment reaches the terminal paid/captured state;
- the same successful payment has not already been attributed;
- in proof mode, the event is signature-verified and confirmed through a Razorpay API fetch.

Natural recovery under `NO_ACTION` is measured and deducted through the paired baseline comparison. Projected probability never counts as recovered revenue.

## 16. Honest claims policy

The product uses three distinct labels:

- **Recovered — Razorpay test mode:** confirmed through a signed test webhook, matching amount/reference, and Razorpay API verification.
- **Recovered — simulation:** generated by the published deterministic benchmark.
- **Projected recovery:** model estimate that has not been observed.

These values must never be combined into an unlabeled number.

## 17. Razorpay integration

### Required

- Razorpay test-mode API credentials stored only on the server.
- Test-mode order or Payment Link creation.
- Unique reference ID per recovery attempt.
- Checkout completed explicitly by the test customer.
- Raw-body HMAC-SHA256 webhook signature validation.
- Deduplication using `x-razorpay-event-id`.
- Idempotent processing of duplicate events.
- Correct handling of out-of-order events.
- API verification when immediate or contradictory state requires it.

### Safety requirements

- Never expose the key secret in browser code, logs, screenshots, or repository.
- Never mark a payment recovered from the browser callback alone.
- Never create multiple active links for one order.
- Store amounts in paise as integers.
- Reject webhook actions until signature validation succeeds.
- Do not create real Payment Links for the 100-case benchmark; Razorpay test mode limits Payment Link creation per business, and the batch is intentionally simulated.
- Disable partial payment for proof-mode recovery links so attribution is unambiguous.
- Treat API state as payment truth; a webhook is a notification that triggers idempotent reconciliation.
- Treat failure descriptions, imported text, and webhook text fields strictly as untrusted data. They are delimited in model input and cannot introduce instructions or tools.

Razorpay documents that webhook events may be duplicated or arrive out of order, so this behavior must be tested explicitly.

## 18. Required failure demonstration

### Scenario: duplicate and out-of-order webhook delivery

1. Deliver `payment.captured` before `payment.authorized`.
2. Deliver the captured event twice with the same event ID.
3. RecoveryOS verifies signatures and records the first captured event.
4. The duplicate is acknowledged but not reprocessed.
5. The late authorized event does not regress the payment state.
6. The case remains recovered and pending recovery actions stay cancelled.
7. The audit timeline explains each decision and passes hash-chain verification.

Expected outcome:

- one recovered payment;
- zero duplicate revenue;
- zero duplicate fulfilment or customer contact;
- complete evidence in the audit trail.

An additional invalid-signature event should be rejected and recorded as a security event without changing payment or recovery state. Repeated invalid signatures may trigger one deduplicated operator alert.

## 19. Functional requirements

### FR-1: Batch ingestion

- Import JSON or CSV.
- Validate schema and show rejected rows.
- Support at least 100 cases per run.
- Prevent duplicate case IDs.

### FR-2: Recovery planning

- Produce a structured recommendation per eligible case.
- Display confidence and reason codes.
- Fall back to deterministic rules when the model is unavailable.

### FR-3: Policy enforcement

- Evaluate all mandatory gates before action execution.
- Record every pass and failure.
- Make policy version visible.

### FR-4: Action execution

- Create test-mode Payment Links only for manually approved, eligible proof-mode cases.
- Schedule simulated reminders and retry invitations.
- Guarantee idempotent action creation.

### FR-5: Outcome processing

- Validate webhook signature from the raw request body.
- Deduplicate events.
- Reconcile payment and order state.
- Stop pending actions after recovery.

### FR-6: Measurement

- Run all baseline policies against the same evaluation batch.
- Display gross and net results.
- Export evaluation results as JSON and CSV.

### FR-7: Auditability

- Show every case as a chronological timeline.
- Export a tamper-evident JSON audit trail.
- Include policy and model version information.

### FR-8: Exceptions

- Maintain an explicit unresolved-exceptions queue.
- Require operator disposition for escalated cases.

## 20. Dashboard requirements

### Page 1: Executive overview — P0

- Revenue at risk
- Simulated revenue recovered
- Razorpay test-mode revenue recovered
- Incremental net recovery versus baseline
- Contact rate
- Escalation and unresolved counts
- Recovery curve over time

### Page 2: Batch comparison — P0

- Side-by-side baseline table
- Recovery by failure category
- Recovery by action
- Gross versus net recovery
- Policy violations, which must remain zero

### Page 3: Recovery queue — P0

- Filter by state, diagnosis, action, confidence, and escalation
- Bulk planning allowed
- Bulk monetary execution prohibited

### Page 4: Case detail — P0

- Original payment evidence
- AI diagnosis
- Policy-gate result
- Recovery action
- Webhook/payment state
- Immutable audit timeline
- Approve, reject, stop, or escalate controls where applicable

### Page 5: Policy configuration — P1

- Limits with safe defaults
- Versioned changes
- Preview of how many current cases would become eligible

### Page 6: Failure lab — P0

- Inject duplicate webhook
- Inject out-of-order webhook
- Inject invalid signature
- Simulate model timeout
- Display expected versus actual invariant results

## 21. State machine

```text
DETECTED
  → INELIGIBLE_STOPPED
  → ANALYZING
      → POLICY_BLOCKED
      → ESCALATED
      → AWAITING_APPROVAL (proof mode only)
          → ACTION_REJECTED
          → ACTION_APPROVED
      → ACTION_APPROVED (benchmark mode only)
          → ACTION_SCHEDULED
          → ACTION_SENT
              → RECOVERED
              → RETRY_ELIGIBLE
              → EXHAUSTED
              → EXPIRED
```

Payment state and recovery state must be stored separately. A late payment webhook may move the payment to captured and force the recovery state to `RECOVERED`, but a recovery action can never rewrite payment truth.

## 22. Locked implementation architecture

```text
Web dashboard
    ↓
Application API
    ├── Batch ingestion service
    ├── Recovery orchestrator
    ├── AI diagnosis service
    ├── Deterministic policy engine
    ├── Action executor
    ├── Benchmark simulator
    ├── Razorpay API adapter
    └── Webhook receiver
            ↓
        Relational database
            ├── cases and payment state
            ├── actions and schedules
            ├── policies
            ├── evaluation runs
            └── append-only audit events
```

Implementation decisions for V1:

- Application: one Next.js App Router application using TypeScript.
- UI: React, Tailwind CSS, shadcn/ui, and Recharts.
- API: Next.js route handlers; no separate Python service.
- Validation: Zod schemas shared by ingestion, model output, and API boundaries.
- Database: PostgreSQL with Prisma migrations. Docker Compose provides local PostgreSQL.
- Scheduling: database-backed actions plus a virtual clock for benchmarks. Proof-mode actions are triggered explicitly from the operator UI; no external queue is required for V1.
- AI: OpenAI Responses API with strict JSON-schema output. Model name comes from `OPENAI_MODEL`; no model name is hard-coded into evaluation claims.
- AI fallback: when no API key is present or the model fails twice, a deterministic rules planner completes the run and labels its decisions `fallback_rule`.
- Tests: Vitest for domain logic and Playwright for the critical browser flow.
- Authentication: single synthetic demo merchant; user accounts and multi-tenancy are out of scope.
- Messaging: internal customer-inbox simulator only; no real email, SMS, WhatsApp, or voice integration.
- Deployment: local Docker-supported demo is required. Hosted deployment is optional and must use PostgreSQL rather than an ephemeral filesystem database.

### 22.1 Environment contract

The application reads these variables from `.env.local`; `.env.example` contains names and safe placeholders only:

```text
DATABASE_URL
OPENAI_API_KEY
OPENAI_MODEL
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
APP_BASE_URL
BENCHMARK_SEED
```

`OPENAI_API_KEY` and all Razorpay variables are optional in benchmark-only development. Proof mode is disabled with a visible configuration message when Razorpay values are absent. No code path silently substitutes fake Razorpay success in proof mode.

### 22.2 API contract

Minimum route surface:

| Method and route | Purpose |
|---|---|
| `POST /api/batches/import` | Validate and import a versioned CSV/JSON batch |
| `POST /api/batches/{id}/plan` | Run eligibility, AI/rules planning, and policy validation |
| `POST /api/evaluations/{batchId}/run` | Evaluate frozen plans against all four policies |
| `GET /api/evaluations/{id}` | Return metrics, exceptions, versions, and checksums |
| `GET /api/cases` | Filter and paginate recovery cases |
| `GET /api/cases/{id}` | Return case, plan, state, actions, and audit timeline |
| `POST /api/cases/{id}/approve` | Approve one proof-mode action after rechecking policy |
| `POST /api/cases/{id}/reject` | Reject and record an operator reason |
| `POST /api/cases/{id}/stop` | Stop future actions idempotently |
| `POST /api/cases/{id}/escalate` | Create one deduplicated internal escalation |
| `POST /api/razorpay/webhook` | Validate raw body, deduplicate, persist, and reconcile |
| `POST /api/failure-lab/run` | Run safe local webhook/model failure fixtures |
| `GET /api/audit/{caseId}/export` | Export and verify the case hash chain |

All mutation routes accept an idempotency key. Approval re-evaluates current payment state, consent, limits, quiet hours, and active-link uniqueness inside the same transaction used to create the action.

### 22.3 Repository layout

```text
app/                    # pages and route handlers
components/             # dashboard UI
lib/domain/             # state machine, policy, money, attribution
lib/ai/                 # prompt, schema, model adapter, fallback
lib/razorpay/           # API client, webhook verification, reconciliation
lib/benchmark/          # generator, virtual clock, policies, evaluator
lib/audit/               # canonicalization, hashing, verification
prisma/                 # schema, migrations, seed
fixtures/public/        # agent-visible datasets
fixtures/evaluator/     # hidden potential outcomes; server evaluator only
tests/unit/             # deterministic domain tests
tests/e2e/              # critical product flows
docs/                   # architecture, benchmark and limitations
```

## 23. Core data entities

- `Merchant`
- `RecoveryCase`
- `PaymentAttempt`
- `RecoveryPlan`
- `RecoveryAction`
- `PolicyVersion`
- `WebhookEvent`
- `Escalation`
- `AuditEvent`
- `EvaluationRun`
- `EvaluationOutcome`
- `PaymentAttribution`

Every `RecoveryAction` must have an idempotency key derived from merchant, case, action type, and attempt number.

### 23.1 Mandatory database invariants

- `RecoveryCase`: unique `(merchant_id, case_id)`.
- `RecoveryAction`: globally unique `idempotency_key`.
- `WebhookEvent`: unique `(merchant_id, razorpay_event_id)`; raw body is stored encrypted or omitted after retaining the minimum sanitized evidence needed for the demo.
- `AuditEvent`: unique `(case_id, sequence_number)` and immutable through the application API.
- `PaymentAttribution`: unique `razorpay_payment_id`; one payment cannot recover multiple cases.
- `Escalation`: at most one open escalation for the same case and reason code.
- `RecoveryPlan`: one frozen plan per `(case_id, planner_version, evaluation_run_id)`.
- Monetary fields: integer, non-negative paise with `currency = INR` in V1.
- One active proof-mode Payment Link per case; enforce transactionally and, where supported, with a partial unique index.
- Terminal payment state cannot regress, and terminal recovery states cannot schedule new actions.

## 24. Non-functional requirements

- Batch of 100 cases completes planning in under 60 seconds, excluding external model latency retries.
- Dashboard loads summary data in under two seconds on the demo dataset.
- All external operations are idempotent.
- Model failure cannot bypass policy or corrupt case state.
- Personally identifiable information is synthetic and minimized.
- Logs redact credentials, contact details, and webhook secrets.
- All timestamps are stored in UTC and displayed with timezone.
- Evaluation run is reproducible from dataset version, policy version, model version, prompt version, and simulator seed.

## 25. Acceptance criteria

The MVP is complete only when all conditions pass:

- [ ] At least 100 cases can be imported and processed.
- [ ] Four policies run against the same frozen batch.
- [ ] Dashboard reports gross and incremental net recovered revenue.
- [ ] Evaluation uses the exact same held-out dataset checksum for all four policies.
- [ ] Test-mode and simulated recovery are labeled separately.
- [ ] At least one Razorpay test-mode payment is recovered end to end.
- [ ] Every executed action has a preceding policy decision.
- [ ] Opted-out, blocked, exhausted, and already-paid cases are never contacted.
- [ ] Maximum-attempt and quiet-hour rules are enforced.
- [ ] Duplicate Payment Links cannot be created for the same attempt.
- [ ] Duplicate and out-of-order webhooks are handled correctly.
- [ ] Invalid webhook signatures do not change state.
- [ ] Model timeout produces a safe fallback or escalation.
- [ ] Every case has an exportable audit trail.
- [ ] Every audit export passes hash-chain verification.
- [ ] A successful payment can be attributed to only one case.
- [ ] Benchmark mode makes zero network calls to Razorpay or messaging services.
- [ ] Proof-mode action creation requires explicit operator approval and creates at most three test Payment Links per demo run.
- [ ] Unresolved cases appear in an honest exception list.
- [ ] Automated tests cover policy rules, state transitions, idempotency, and webhook validation.

## 26. Build plan

### Phase 1 — Deterministic foundation

- Define schemas and state machines.
- Build dataset generator and frozen benchmark.
- Implement policy engine.
- Implement simulator and baseline comparison.
- Add unit tests.

### Phase 2 — Recovery product

- Build ingestion, queue, case detail, and policy UI.
- Add recovery action scheduling.
- Add append-only audit events.
- Add dashboard metrics.

### Phase 3 — AI judgment

- Add structured diagnosis and action recommendation.
- Validate every output against schema and allow-list.
- Add confidence escalation and deterministic fallback.
- Record model and prompt versions.

### Phase 4 — Razorpay proof

- Add test-mode Payment Link creation.
- Add signed webhook processing and API verification.
- Add duplicate/out-of-order/invalid-signature tests.
- Complete one end-to-end test recovery.

### Phase 5 — Evidence and presentation

- Freeze evaluation dataset and seed.
- Run final baseline comparison.
- Export metrics and exceptions.
- Prepare architecture diagram, public README, and five-minute demonstration.

## 27. Five-minute demo script

### 0:00–0:40 — Problem and promise

Show ₹ amount at risk across 100 failed payments. Explain that RecoveryOS must recover money, not merely detect failure.

### 0:40–1:30 — Agent decision

Open one case. Show diagnosis, confidence, recommended action, expected value, and passed policy gates.

### 1:30–2:20 — Real test-mode recovery

Approve creation of a Razorpay test Payment Link, complete Checkout, receive the signed webhook, and watch pending actions stop.

### 2:20–3:10 — Safety and failure handling

Replay the webhook, send it out of order, then inject an invalid signature. Show zero duplicate processing and a clear escalation.

### 3:10–4:15 — Batch evidence

Compare no action, contact everyone, fixed retry, and RecoveryOS. Highlight incremental net recovered revenue, contact reduction, and zero policy violations.

### 4:15–5:00 — Audit and limitations

Export the case audit trail, show unresolved exceptions, and state clearly which results are simulated versus Razorpay test mode.

## 28. Final submission claim

Use a claim of this form only after final evaluation:

> RecoveryOS processed **[N]** held-out failed-payment cases representing **₹[X]** in simulated revenue at risk. It recovered **₹[Y] simulated** net of intervention cost, an incremental **₹[Z]** over the fixed-reminder baseline, while producing **zero unauthorized contacts**, respecting all stopping rules, and escalating **[E]** unresolved cases. Separately, **[R] Razorpay test-mode payments** were recovered and verified through signed, idempotent webhook processing.

Do not fill these values until the frozen evaluation has run.

## 29. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Results look fabricated | Publish simulator rules, seed, dataset split, and baseline outputs |
| AI appears unnecessary | Demonstrate ambiguous diagnoses and personalized action selection; keep verification deterministic |
| Project becomes a reminder bot | Show diagnosis, policy optimization, outcome verification, and baseline comparison |
| Test-mode behavior differs from production | Label test evidence honestly and avoid production-performance claims |
| Over-contacting customers | Enforce consent, quiet hours, caps, suppression, and stopping rules in code |
| Duplicate money/action reporting | Idempotency keys, unique constraints, webhook event deduplication, API reconciliation |
| Scope becomes too large | Ship failed checkout recovery only in version 1 |

## 30. Definition of success

RecoveryOS succeeds when a judge can independently answer:

1. How much money was at risk?
2. How much was actually recovered in the benchmark?
3. How much better was the agent than simple baselines?
4. Which customers were intentionally not contacted, and why?
5. When did the system stop or escalate?
6. Can every action be reconstructed from the audit trail?
7. Did the real Razorpay test-mode flow work end to end?
8. What failed, and did the system recover safely?

If any answer is unclear, the submission has not yet met the Track 03 bar.

## 31. Implementation-agent kickoff contract

This section is the authoritative handoff. An implementation agent should not reopen locked V1 product or stack decisions unless a required dependency is unavailable.

### First deliverable

Create a runnable vertical slice before building the polished dashboard:

1. Scaffold the locked Next.js/TypeScript/PostgreSQL stack.
2. Add Prisma entities and migrations for merchant, case, plan, action, policy, webhook, escalation, evaluation, and audit event.
3. Implement the recovery and payment state machines as pure functions with illegal-transition tests.
4. Implement policy eligibility, quiet-hour deferral, stopping rules, and idempotency constraints.
5. Generate the 180-case versioned dataset and separate evaluator fixture.
6. Run four deterministic policies against the frozen 100-case held-out batch.
7. Produce a JSON report containing dataset checksum, policy version, seed, gross recovery, assumed costs, net recovery, contacts, escalations, blocked cases, and unresolved cases.
8. Render those results on one basic dashboard page.

The first deliverable is accepted when a fresh clone can start PostgreSQL, apply migrations, seed data, run unit tests, execute the benchmark, and open the results page using commands documented in the README.

### Second deliverable

Add AI planning behind the same typed planner interface. The deterministic planner remains available for tests and fallback. Freeze plans before held-out scoring and record model, prompt, and schema versions.

### Third deliverable

Add proof mode: operator approval, Razorpay test Payment Link, signed webhook ingestion, API reconciliation, attribution, stopping behavior, and the required failure-lab scenario.

### Required implementation principles

- Domain and policy logic must be independent of UI and model adapters.
- All money values use integer paise; formatting happens only at presentation boundaries.
- All timestamps use UTC internally.
- Database constraints backstop application-level idempotency.
- No hidden evaluator field may appear in planner types, API responses, logs, or model prompts.
- The benchmark must run without OpenAI or Razorpay credentials.
- Proof mode must fail closed when credentials, signature, consent, or payment truth are unavailable.
- Every state-changing operation emits its audit event in the same database transaction.
- Never tune the held-out dataset after observing final results; create a new version and disclose it if correction is necessary.

### Minimum documentation delivered with the code

- `README.md`: setup, commands, environment variables, demo path, and honest claim labels.
- `docs/ARCHITECTURE.md`: component boundaries and state ownership.
- `docs/BENCHMARK.md`: generator, potential outcomes, costs, baselines, checksums, and reproducibility.
- `docs/SAFETY.md`: consent rules, action gates, stopping rules, escalation, secrets, and prompt-injection boundary.
- `docs/LIMITATIONS.md`: synthetic-data, simulation, test-mode, and production-readiness limitations.

### Explicitly deferred work

Do not build authentication, multi-tenancy, real customer messaging, live Razorpay mode, subscription recovery, voice recovery, fraud scoring, or automatic code modification before all P0 acceptance criteria pass.

## References

- Razorpay Buildathon tracks: https://razorpay.com/buildathon/#tracks
- Razorpay Payment Links API: https://razorpay.com/docs/api/payments/payment-links/
- Razorpay webhook validation and testing: https://razorpay.com/docs/webhooks/validate-test/
- Razorpay webhook architecture: https://razorpay.com/docs/webhooks/
