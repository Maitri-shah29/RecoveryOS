-- AlterTable
ALTER TABLE "evaluation_runs" ADD COLUMN     "batch_id" UUID;

-- AlterTable
ALTER TABLE "recovery_cases" ADD COLUMN     "batch_id" UUID;

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "case_id" UUID,
ADD COLUMN     "provider_payment_id" TEXT;

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "mode" "OperatingMode" NOT NULL,
    "dataset_version" TEXT NOT NULL,
    "dataset_checksum" CHAR(64) NOT NULL,
    "case_count" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'IMPORTED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deliver_at" TIMESTAMPTZ(3) NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batches_merchant_id_external_id_key" ON "batches"("merchant_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_messages_action_id_key" ON "inbox_messages"("action_id");

-- CreateIndex
CREATE INDEX "inbox_messages_case_id_deliver_at_idx" ON "inbox_messages"("case_id", "deliver_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_merchant_id_idempotency_key_key" ON "idempotency_records"("merchant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "evaluation_runs_batch_id_idx" ON "evaluation_runs"("batch_id");

-- CreateIndex
CREATE INDEX "recovery_cases_batch_id_idx" ON "recovery_cases"("batch_id");

-- CreateIndex
CREATE INDEX "webhook_events_case_id_received_at_idx" ON "webhook_events"("case_id", "received_at");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "recovery_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "recovery_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
