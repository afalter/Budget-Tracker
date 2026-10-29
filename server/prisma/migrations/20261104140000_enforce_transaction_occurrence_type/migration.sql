-- Draft only: additive type-consistency enforcement.
-- Apply after 20261104130000_add_cross_account_consistency_constraints.
-- No DELETE trigger is introduced; physical-delete behavior remains unchanged.

CREATE OR REPLACE FUNCTION "enforce_actual_transaction_occurrence_type"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    occurrence_type "OccurrenceType";
BEGIN
    IF NEW."occurrenceId" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT o."type"
      INTO occurrence_type
      FROM "Occurrence" AS o
     WHERE o."accountId" = NEW."accountId"
       AND o."id" = NEW."occurrenceId";

    IF occurrence_type IS NULL THEN
        -- The composite foreign key reports a missing occurrence. This guard is
        -- only defensive and leaves the FK as the authoritative existence check.
        RETURN NEW;
    END IF;

    IF NEW."type"::text <> occurrence_type::text THEN
        RAISE EXCEPTION
            'ActualTransaction type % does not match Occurrence type % for occurrence %',
            NEW."type", occurrence_type, NEW."occurrenceId"
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "enforce_occurrence_actual_transaction_type"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    transaction_type "TransactionType";
BEGIN
    SELECT t."type"
      INTO transaction_type
      FROM "ActualTransaction" AS t
     WHERE t."accountId" = NEW."accountId"
       AND t."occurrenceId" = NEW."id";

    IF transaction_type IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW."type"::text <> transaction_type::text THEN
        RAISE EXCEPTION
            'Occurrence type % does not match ActualTransaction type % for occurrence %',
            NEW."type", transaction_type, NEW."id"
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "ActualTransaction_type_consistency_trigger"
BEFORE INSERT OR UPDATE OF "accountId", "type", "occurrenceId"
ON "ActualTransaction"
FOR EACH ROW
EXECUTE FUNCTION "enforce_actual_transaction_occurrence_type"();

CREATE TRIGGER "Occurrence_type_consistency_trigger"
BEFORE UPDATE OF "accountId", "type", "id"
ON "Occurrence"
FOR EACH ROW
EXECUTE FUNCTION "enforce_occurrence_actual_transaction_type"();
