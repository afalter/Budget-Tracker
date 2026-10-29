-- Draft only: serialize all type-consistency checks by account.
-- Apply after 20261104140000_enforce_transaction_occurrence_type.
-- No DELETE trigger is introduced; soft-delete and physical-delete behavior stay unchanged.

-- Every relevant write path takes the same transaction-scoped advisory lock.
-- Old and new account ids are acquired in lexical order for account moves.
CREATE OR REPLACE FUNCTION "lock_transaction_occurrence_type_account"(
    old_account_id TEXT,
    new_account_id TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    IF old_account_id IS NULL OR new_account_id IS NULL THEN
        IF old_account_id IS NOT NULL THEN
            PERFORM pg_advisory_xact_lock(hashtextextended(old_account_id, 20261104140000::bigint));
        ELSIF new_account_id IS NOT NULL THEN
            PERFORM pg_advisory_xact_lock(hashtextextended(new_account_id, 20261104140000::bigint));
        END IF;
    ELSIF old_account_id <= new_account_id THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(old_account_id, 20261104140000::bigint));
        IF old_account_id <> new_account_id THEN
            PERFORM pg_advisory_xact_lock(hashtextextended(new_account_id, 20261104140000::bigint));
        END IF;
    ELSE
        PERFORM pg_advisory_xact_lock(hashtextextended(new_account_id, 20261104140000::bigint));
        PERFORM pg_advisory_xact_lock(hashtextextended(old_account_id, 20261104140000::bigint));
    END IF;
END;
$$;

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

    SELECT o."type"
      INTO occurrence_type
      FROM "Occurrence" AS o
     WHERE o."accountId" = NEW."accountId"
       AND o."id" = NEW."occurrenceId";

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