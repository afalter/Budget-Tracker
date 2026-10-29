-- Draft only: serialize type checks with an account advisory lock and a
-- current row lock on the existing counterpart.
-- Apply after 20261104150000_serialize_transaction_occurrence_type_checks.
-- No DELETE trigger is introduced; soft-delete and physical-delete behavior
-- remain unchanged.

CREATE OR REPLACE FUNCTION "enforce_actual_transaction_occurrence_type"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    occurrence_type "OccurrenceType";
BEGIN
    IF TG_OP = 'UPDATE' THEN
        PERFORM "lock_transaction_occurrence_type_account"(OLD."accountId", NEW."accountId");
    ELSE
        PERFORM "lock_transaction_occurrence_type_account"(NULL, NEW."accountId");
    END IF;

    IF NEW."occurrenceId" IS NULL THEN
        RETURN NEW;
    END IF;

    -- FOR UPDATE waits for a concurrent committed row version and locks the
    -- current counterpart before the type comparison.
    SELECT o."type"
      INTO occurrence_type
      FROM "Occurrence" AS o
     WHERE o."accountId" = NEW."accountId"
       AND o."id" = NEW."occurrenceId"
     FOR UPDATE;

    IF occurrence_type IS NULL THEN
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
    IF TG_OP = 'UPDATE' THEN
        PERFORM "lock_transaction_occurrence_type_account"(OLD."accountId", NEW."accountId");
    ELSE
        PERFORM "lock_transaction_occurrence_type_account"(NULL, NEW."accountId");
    END IF;

    -- FOR UPDATE waits for a concurrent committed row version and locks the
    -- current counterpart before the type comparison.
    SELECT t."type"
      INTO transaction_type
      FROM "ActualTransaction" AS t
     WHERE t."accountId" = NEW."accountId"
       AND t."occurrenceId" = NEW."id"
     FOR UPDATE;

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
