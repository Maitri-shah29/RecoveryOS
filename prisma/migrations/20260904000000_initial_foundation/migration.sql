-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OperatingMode" AS ENUM ('BENCHMARK', 'RAZORPAY_PROOF');

-- CreateEnum
CREATE TYPE "RecoveryState" AS ENUM ('DETECTED', 'INELIGIBLE_STOPPED', 'ANALYZING', 'POLICY_BLOCKED', 'ESCALATED', 'AWAITING_APPROVAL', 'ACTION_REJECTED', 'ACTION_APPROVED', 'ACTION_SCHEDULED', 'ACTION_SENT', 'RECOVERED', 'RETRY_ELIGIBLE', 'EXHAUSTED', 'EXPIRED', 'MANUALLY_STOPPED');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('FAILED', 'AUTHORIZED', 'CAPTURED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('NO_ACTION', 'REMINDER', 'RETRY_INVITATION', 'FRESH_CHECKOUT_LINK', 'ASSISTED_REVIEW');

-- CreateEnum
CREATE TYPE "ActionState" AS ENUM ('PROPOSED', 'SCHEDULED', 'SENT', 'CANCELLED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'AI', 'OPERATOR', 'CUSTOMER', 'RAZORPAY');

-- CreateEnum
CREATE TYPE "EscalationState" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "EvaluationState" AS ENUM ('CREATED', 'PLANS_FROZEN', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_cases" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "case_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "mode" "OperatingMode" NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "failure_code" TEXT NOT NULL,
    "failure_description" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,
    "customer_segment" TEXT NOT NULL,
    "prior_attempts" INTEGER NOT NULL,
    "recovery_contacts_7d" INTEGER NOT NULL,
    "consent_status" TEXT NOT NULL,
    "risk_flag" TEXT NOT NULL,
    "preferred_channel" TEXT NOT NULL,
    "customer_timezone" TEXT NOT NULL,
    "payment_state" "PaymentState" NOT NULL DEFAULT 'FAILED',
    "recovery_state" "RecoveryState" NOT NULL DEFAULT 'DETECTED',
    "dataset_version" TEXT,
    "dataset_split" TEXT,
    "simulation_profile_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recovery_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "provider_payment_id" TEXT,
    "attempt_number" INTEGER NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "state" "PaymentState" NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_plans" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "evaluation_run_id" UUID,
    "planner_version" TEXT NOT NULL,
    "planner_type" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "proposed_action" "ActionType" NOT NULL,
    "delay_minutes" INTEGER NOT NULL,
    "reason_codes" TEXT[],
    "policy_decision" JSONB NOT NULL,
    "frozen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_actions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "plan_id" UUID,
    "policy_version_id" UUID NOT NULL,
    "mode" "OperatingMode" NOT NULL,
    "type" "ActionType" NOT NULL,
    "state" "ActionState" NOT NULL DEFAULT 'PROPOSED',
    "attempt_number" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3),
    "external_reference" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recovery_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "razorpay_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "sanitized_evidence" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "reason_code" TEXT NOT NULL,
    "state" "EscalationState" NOT NULL DEFAULT 'OPEN',
    "context" JSONB NOT NULL,
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "event_type" TEXT NOT NULL,
    "input_refs" JSONB NOT NULL,
    "decision" JSONB NOT NULL,
    "reason_codes" TEXT[],
    "policy_snapshot" JSONB NOT NULL,
    "model_metadata" JSONB,
    "previous_hash" CHAR(64) NOT NULL,
    "event_hash" CHAR(64) NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_runs" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "dataset_version" TEXT NOT NULL,
    "dataset_checksum" CHAR(64) NOT NULL,
    "seed_id" TEXT NOT NULL,
    "state" "EvaluationState" NOT NULL DEFAULT 'CREATED',
    "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_outcomes" (
    "id" UUID NOT NULL,
    "evaluation_run_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "policy_name" TEXT NOT NULL,
    "action" "ActionType" NOT NULL,
    "delay_minutes" INTEGER NOT NULL,
    "recovered" BOOLEAN NOT NULL,
    "recovered_paise" INTEGER NOT NULL,
    "intervention_cost_paise" INTEGER NOT NULL,
    "outcome_at" TIMESTAMPTZ(3),

    CONSTRAINT "evaluation_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attributions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "razorpay_payment_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "evidence" JSONB NOT NULL,
    "attributed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_cases_mode_recovery_state_idx" ON "recovery_cases"("mode", "recovery_state");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_cases_merchant_id_case_id_key" ON "recovery_cases"("merchant_id", "case_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_case_id_attempt_number_key" ON "payment_attempts"("case_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_merchant_id_version_key" ON "policy_versions"("merchant_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_plans_case_id_planner_version_evaluation_run_id_key" ON "recovery_plans"("case_id", "planner_version", "evaluation_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_actions_idempotency_key_key" ON "recovery_actions"("idempotency_key");

-- CreateIndex
CREATE INDEX "recovery_actions_case_id_state_idx" ON "recovery_actions"("case_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_merchant_id_razorpay_event_id_key" ON "webhook_events"("merchant_id", "razorpay_event_id");

-- CreateIndex
CREATE INDEX "escalations_case_id_reason_code_state_idx" ON "escalations"("case_id", "reason_code", "state");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_case_id_sequence_number_key" ON "audit_events"("case_id", "sequence_number");

-- CreateIndex
CREATE INDEX "evaluation_runs_dataset_version_state_idx" ON "evaluation_runs"("dataset_version", "state");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_outcomes_evaluation_run_id_case_id_policy_name_key" ON "evaluation_outcomes"("evaluation_run_id", "case_id", "policy_name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attributions_razorpay_payment_id_key" ON "payment_attributions"("razorpay_payment_id");

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_plans" ADD CONSTRAINT "recovery_plans_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_plans" ADD CONSTRAINT "recovery_plans_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_plans" ADD CONSTRAINT "recovery_plans_evaluation_run_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "evaluation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "recovery_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_actions" ADD CONSTRAINT "recovery_actions_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_outcomes" ADD CONSTRAINT "evaluation_outcomes_evaluation_run_id_fkey" FOREIGN KEY ("evaluation_run_id") REFERENCES "evaluation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_outcomes" ADD CONSTRAINT "evaluation_outcomes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attributions" ADD CONSTRAINT "payment_attributions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints that Prisma cannot express directly.
ALTER TABLE "recovery_cases"
  ADD CONSTRAINT "recovery_cases_amount_nonnegative" CHECK ("amount_paise" >= 0),
  ADD CONSTRAINT "recovery_cases_currency_inr" CHECK ("currency" = 'INR');

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_amount_nonnegative" CHECK ("amount_paise" >= 0),
  ADD CONSTRAINT "payment_attempts_currency_inr" CHECK ("currency" = 'INR');

ALTER TABLE "evaluation_outcomes"
  ADD CONSTRAINT "evaluation_outcomes_money_nonnegative" CHECK ("recovered_paise" >= 0 AND "intervention_cost_paise" >= 0);

ALTER TABLE "payment_attributions"
  ADD CONSTRAINT "payment_attributions_amount_nonnegative" CHECK ("amount_paise" >= 0),
  ADD CONSTRAINT "payment_attributions_currency_inr" CHECK ("currency" = 'INR');

CREATE UNIQUE INDEX "one_active_proof_link_per_case"
  ON "recovery_actions" ("case_id")
  WHERE "mode" = 'RAZORPAY_PROOF'
    AND "type" = 'FRESH_CHECKOUT_LINK'
    AND "state" IN ('PROPOSED', 'SCHEDULED', 'SENT');

CREATE UNIQUE INDEX "one_open_escalation_per_case_reason"
  ON "escalations" ("case_id", "reason_code")
  WHERE "state" = 'OPEN';

CREATE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_immutable"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE FUNCTION prevent_terminal_payment_regression() RETURNS trigger AS $$
BEGIN
  IF OLD."payment_state" IN ('CAPTURED', 'PAID') AND NEW."payment_state" <> OLD."payment_state" THEN
    RAISE EXCEPTION 'terminal payment state cannot regress';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recovery_cases_terminal_payment_guard"
  BEFORE UPDATE OF "payment_state" ON "recovery_cases"
  FOR EACH ROW EXECUTE FUNCTION prevent_terminal_payment_regression();

CREATE FUNCTION prevent_action_after_terminal_recovery() RETURNS trigger AS $$
DECLARE current_state "RecoveryState";
BEGIN
  SELECT "recovery_state" INTO current_state FROM "recovery_cases" WHERE "id" = NEW."case_id" FOR UPDATE;
  IF current_state IN ('INELIGIBLE_STOPPED', 'POLICY_BLOCKED', 'ACTION_REJECTED', 'RECOVERED', 'EXHAUSTED', 'EXPIRED', 'MANUALLY_STOPPED') THEN
    RAISE EXCEPTION 'terminal recovery state cannot create a new action';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recovery_actions_terminal_case_guard"
  BEFORE INSERT ON "recovery_actions"
  FOR EACH ROW EXECUTE FUNCTION prevent_action_after_terminal_recovery();
