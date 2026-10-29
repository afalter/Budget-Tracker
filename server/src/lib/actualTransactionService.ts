import { Prisma, PrismaClient } from "@prisma/client";

const ACCOUNT_PROCESSING_LOCK_SCOPE = 20261104140000n;

/**
 * Soft-delete one transaction and, for automatic transactions, skip its
 * completed occurrence in the same database transaction.
 */
export async function softDeleteActualTransaction(
  db: PrismaClient,
  accountId: string,
  transactionId: string
): Promise<Prisma.ActualTransactionGetPayload<{ include: { occurrence: true } }>> {
  return db.$transaction(async (tx) => {
    await lockAccountProcessing(tx, accountId);
    return softDeleteActualTransactionInTransaction(tx, accountId, transactionId);
  });
}

export async function updateActualTransaction(
  db: PrismaClient,
  accountId: string,
  transactionId: string,
  data: { amount?: number; note?: string | null; occurredAt?: Date }
): Promise<Prisma.ActualTransactionGetPayload<{ include: { occurrence: true } }>> {
  return db.$transaction(async (tx) => {
    await lockAccountProcessing(tx, accountId);
    const transaction = await tx.actualTransaction.findFirst({
      where: { id: transactionId, accountId, deletedAt: null },
    });
    if (!transaction) {
      throw new Error("Actual transaction not found");
    }

    return tx.actualTransaction.update({
      where: { id: transaction.id },
      data,
      include: { occurrence: true },
    });
  });
}

export async function softDeleteActualTransactionInTransaction(
  tx: Prisma.TransactionClient,
  accountId: string,
  transactionId: string
): Promise<Prisma.ActualTransactionGetPayload<{ include: { occurrence: true } }>> {
  const transaction = await tx.actualTransaction.findFirst({
    where: { id: transactionId, accountId },
    include: { occurrence: true },
  });
  if (!transaction) {
    throw new Error("Actual transaction not found");
  }

  if (!transaction.deletedAt) {
    await tx.actualTransaction.update({
      where: { id: transaction.id },
      data: { deletedAt: new Date() },
    });
  }

  if (transaction.occurrenceId && transaction.occurrence) {
    await tx.occurrence.updateMany({
      where: {
        id: transaction.occurrence.id,
        accountId,
        status: "COMPLETED",
      },
      data: { status: "SKIPPED", statusChangedAt: new Date() },
    });
  }

  return tx.actualTransaction.findUniqueOrThrow({
    where: { id: transaction.id },
    include: { occurrence: true },
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