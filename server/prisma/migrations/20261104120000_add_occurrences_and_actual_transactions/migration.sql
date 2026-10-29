-- Draft only: do not apply until the occurrence/transaction write paths are deployed.
-- This migration is additive and intentionally leaves the initial migration unchanged.

-- CreateEnum
CREATE TYPE "OccurrenceType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionOrigin" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "OccurrenceType" NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'PLANNED',
    "incomeSourceId" TEXT,
    "plannedExpenseId" TEXT,
    "anchorDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "plannedAmount" DECIMAL(18,2) NOT NULL,
    "effectiveAmount" DECIMAL(18,2) NOT NULL,
    "identityKey" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "categorySnapshot" TEXT,
    "originalRuleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "origin" "TransactionOrigin" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "category" TEXT,
    "occurrenceId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Occurrence_identityKey_key" ON "Occurrence"("identityKey");
CREATE UNIQUE INDEX "ActualTransaction_occurrenceId_key" ON "ActualTransaction"("occurrenceId");
CREATE INDEX "Occurrence_accountId_dueDate_idx" ON "Occurrence"("accountId", "dueDate");
CREATE INDEX "Occurrence_incomeSourceId_idx" ON "Occurrence"("incomeSourceId");
CREATE INDEX "Occurrence_plannedExpenseId_idx" ON "Occurrence"("plannedExpenseId");
CREATE INDEX "Occurrence_status_dueDate_idx" ON "Occurrence"("status", "dueDate");
CREATE INDEX "ActualTransaction_accountId_occurredAt_idx" ON "ActualTransaction"("accountId", "occurredAt");
CREATE INDEX "ActualTransaction_accountId_deletedAt_idx" ON "ActualTransaction"("accountId", "deletedAt");
CREATE INDEX "ActualTransaction_origin_idx" ON "ActualTransaction"("origin");

-- Database-enforced invariants that can be expressed row-locally.
ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_source_type_check"
    CHECK (
        ("type" = 'INCOME' AND "incomeSourceId" IS NOT NULL AND "plannedExpenseId" IS NULL)
        OR
        ("type" = 'EXPENSE' AND "incomeSourceId" IS NULL AND "plannedExpenseId" IS NOT NULL)
    );

ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_amounts_nonnegative_check"
    CHECK ("plannedAmount" >= 0 AND "effectiveAmount" >= 0);

ALTER TABLE "ActualTransaction"
    ADD CONSTRAINT "ActualTransaction_amount_nonnegative_check"
    CHECK ("amount" >= 0);

ALTER TABLE "ActualTransaction"
    ADD CONSTRAINT "ActualTransaction_automatic_occurrence_check"
    CHECK ("origin" <> 'AUTOMATIC' OR "occurrenceId" IS NOT NULL);

-- Historical rows must not disappear when a source rule or account is removed.
ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_incomeSourceId_fkey"
    FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_plannedExpenseId_fkey"
    FOREIGN KEY ("plannedExpenseId") REFERENCES "PlannedExpense"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "ActualTransaction"
    ADD CONSTRAINT "ActualTransaction_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "ActualTransaction"
    ADD CONSTRAINT "ActualTransaction_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Cross-row invariants (account/type/status consistency) remain application-transaction rules.
-- They are deliberately not implemented as triggers in this draft.
