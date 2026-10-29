import { Prisma } from "@prisma/client";

export async function archiveIncomeSources(
  tx: Prisma.TransactionClient,
  ids: string[],
  accountId?: string
): Promise<void> {
  if (ids.length === 0) return;

  const where = accountId ? { id: { in: ids }, accountId } : { id: { in: ids } };
  const occurrenceWhere = accountId
    ? { incomeSourceId: { in: ids }, accountId, status: "PLANNED" as const }
    : { incomeSourceId: { in: ids }, status: "PLANNED" as const };

  await tx.occurrence.updateMany({
    where: occurrenceWhere,
    data: { status: "CANCELLED", statusChangedAt: new Date() },
  });
  await tx.incomeSource.updateMany({ where, data: { active: false } });
}

export async function archivePlannedExpenses(
  tx: Prisma.TransactionClient,
  ids: string[],
  accountId?: string
): Promise<void> {
  if (ids.length === 0) return;

  const where = accountId ? { id: { in: ids }, accountId } : { id: { in: ids } };
  const occurrenceWhere = accountId
    ? { plannedExpenseId: { in: ids }, accountId, status: "PLANNED" as const }
    : { plannedExpenseId: { in: ids }, status: "PLANNED" as const };

  await tx.occurrence.updateMany({
    where: occurrenceWhere,
    data: { status: "CANCELLED", statusChangedAt: new Date() },
  });
  await tx.plannedExpense.updateMany({ where, data: { active: false } });
}
