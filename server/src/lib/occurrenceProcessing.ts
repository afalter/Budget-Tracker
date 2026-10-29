import { Prisma, PrismaClient } from "@prisma/client";
import { toUtcDate } from "./date";
import {
  persistAccountOccurrencesInTransaction,
} from "./occurrenceService";

const ACCOUNT_PROCESSING_LOCK_SCOPE = 20261104140000n;

export interface ProcessDueOccurrencesResult {
  snapshotId: string;
  fromDate: Date;
  throughDate: Date;
  occurrencesCreated: number;
  transactionsCreated: number;
  skippedDeletedTransactions: number;
  balance: Prisma.Decimal;
}

/**
 * Persist missing occurrences and book due occurrences for one account.
 * The caller supplies today only to make the UTC calendar boundary testable.
 */
export async function processDueOccurrencesForAccount(
  db: PrismaClient,
  accountId: string,
  today = new Date()
): Promise<ProcessDueOccurrencesResult | null> {
  return db.$transaction(async (tx) => {
    await lockAccountProcessing(tx, accountId);

    const snapshot = await tx.balanceSnapshot.findFirst({
      where: { accountId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    if (!snapshot) return null;

    const snapshotDate = toUtcDate(snapshot.date);
    const fromDate = addUtcDays(snapshotDate, 1);
    const throughDate = toUtcDate(today);
    if (fromDate > throughDate) {
      return {
        snapshotId: snapshot.id,
        fromDate,
        throughDate,
        occurrencesCreated: 0,
        transactionsCreated: 0,
        skippedDeletedTransactions: 0,
        balance: new Prisma.Decimal(snapshot.amount),
      };
    }

    const persisted = await persistAccountOccurrencesInTransaction(
      tx,
      accountId,
      fromDate,
      throughDate
    );

    const occurrenceIds = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Occurrence"
      WHERE "accountId" = ${accountId}
        AND "status" = 'PLANNED'
        AND "dueDate" >= ${fromDate}
        AND "dueDate" <= ${throughDate}
      ORDER BY "dueDate" ASC, "id" ASC
      FOR UPDATE
    `;

    let transactionsCreated = 0;
    let skippedDeletedTransactions = 0;
    for (const { id } of occurrenceIds) {
      const occurrence = await tx.occurrence.findUniqueOrThrow({
        where: { id },
        include: { actualTransaction: true },
      });

      // Re-read the current row under the transaction lock. A transaction
      // already linked to an occurrence is never replaced or duplicated.
      if (occurrence.status !== "PLANNED") continue;
      if (occurrence.actualTransaction) {
        if (occurrence.actualTransaction.deletedAt) {
          await tx.occurrence.update({
            where: { id: occurrence.id },
            data: { status: "SKIPPED", statusChangedAt: new Date() },
          });
          skippedDeletedTransactions++;
        } else {
          await tx.occurrence.update({
            where: { id: occurrence.id },
            data: { status: "COMPLETED", statusChangedAt: new Date() },
          });
        }
        continue;
      }

      await tx.actualTransaction.create({
        data: {
          accountId,
          type: occurrence.type,
          origin: "AUTOMATIC",
          occurredAt: occurrence.dueDate,
          amount: occurrence.effectiveAmount,
          note: occurrence.nameSnapshot,
          category: occurrence.categorySnapshot,
          occurrenceId: occurrence.id,
        },
      });
      await tx.occurrence.update({
        where: { id: occurrence.id },
        data: { status: "COMPLETED", statusChangedAt: new Date() },
      });
      transactionsCreated++;
    }

    const transactions = await tx.actualTransaction.findMany({
      where: {
        accountId,
        deletedAt: null,
        occurredAt: {
          gte: fromDate,
          lt: addUtcDays(throughDate, 1),
        },
      },
      select: { type: true, amount: true },
    });
    let balance = new Prisma.Decimal(snapshot.amount);
    for (const transaction of transactions) {
      balance = transaction.type === "INCOME"
        ? balance.add(transaction.amount)
        : balance.sub(transaction.amount);
    }

    return {
      snapshotId: snapshot.id,
      fromDate,
      throughDate,
      occurrencesCreated: persisted.created,
      transactionsCreated,
      skippedDeletedTransactions,
      balance,
    };
  });
}

async function lockAccountProcessing(
  tx: Prisma.TransactionClient,
  accountId: string
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${accountId}, ${ACCOUNT_PROCESSING_LOCK_SCOPE}::bigint)
    )
  `;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}