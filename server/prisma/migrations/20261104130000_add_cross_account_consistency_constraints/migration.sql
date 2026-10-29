-- Draft only: additive follow-up to 20261104120000_add_occurrences_and_actual_transactions.
-- This migration must be applied after the initial migration and the Occurrence migration.
-- It intentionally does not add triggers or alter status/booking semantics.

-- Composite targets make the parent account part of each relationship key.
-- The parent id is already unique by itself; these are additional composite
-- targets required by PostgreSQL for the account-aware foreign keys.
ALTER TABLE "IncomeSource"
    ADD CONSTRAINT "IncomeSource_accountId_id_key" UNIQUE ("accountId", "id");

ALTER TABLE "PlannedExpense"
    ADD CONSTRAINT "PlannedExpense_accountId_id_key" UNIQUE ("accountId", "id");

ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_accountId_id_key" UNIQUE ("accountId", "id");

ALTER TABLE "ActualTransaction"
    ADD CONSTRAINT "ActualTransaction_accountId_occurrenceId_key"
    UNIQUE ("accountId", "occurrenceId");

-- Replace the independent source-id foreign keys with account-consistent keys.
ALTER TABLE "Occurrence"
    DROP CONSTRAINT "Occurrence_incomeSourceId_fkey",
    DROP CONSTRAINT "Occurrence_plannedExpenseId_fkey";

ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_accountId_incomeSourceId_fkey"
    FOREIGN KEY ("accountId", "incomeSourceId")
    REFERENCES "IncomeSource" ("accountId", "id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Occurrence"
    ADD CONSTRAINT "Occurrence_accountId_plannedExpenseId_fkey"
    FOREIGN KEY ("accountId", "plannedExpenseId")
    REFERENCES "PlannedExpense" ("accountId", "id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- Replace the independent occurrence-id foreign key with an account-consistent key.
ALTER TABLE "ActualTransaction"
    DROP CONSTRAINT "ActualTransaction_occurrenceId_fkey";

ALTER TABLE "ActualTransaction"
    ADD CONSTRAINT "ActualTransaction_accountId_occurrenceId_fkey"
    FOREIGN KEY ("accountId", "occurrenceId")
    REFERENCES "Occurrence" ("accountId", "id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- ActualTransaction.type and Occurrence.type use different PostgreSQL enum types.
-- Their equality cannot be represented by a foreign key. It remains an application
-- transaction rule unless a deliberately maintained trigger is introduced later.
