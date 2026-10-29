import { Prisma, PrismaClient } from "@prisma/client";
import {
  calculateOccurrences,
  type OccurrenceRule,
  type CalculatedOccurrence,
} from "./occurrenceGenerator";

export interface PersistOccurrencesResult {
  considered: number;
  created: number;
}

/**
 * Calculate and persist planned occurrences in one database transaction.
 *
 * The caller supplies the complete inclusive date range. This function has no
 * implicit horizon and never creates ActualTransaction rows. `skipDuplicates`
 * makes repeated and concurrent calls safe on Occurrence.identityKey; existing
 * rows, including non-PLANNED rows, are never updated.
 */
export async function persistOccurrences(
  db: PrismaClient,
  rules: OccurrenceRule[],
  fromDate: Date,
  throughDate: Date
): Promise<PersistOccurrencesResult> {
  return db.$transaction((tx) =>
    persistOccurrencesInTransaction(tx, rules, fromDate, throughDate)
  );
}

export async function persistOccurrencesInTransaction(
  tx: Prisma.TransactionClient,
  rules: OccurrenceRule[],
  fromDate: Date,
  throughDate: Date
): Promise<PersistOccurrencesResult> {
  const calculated = rules.flatMap((rule) =>
    calculateOccurrences(rule, fromDate, throughDate)
  );

  if (calculated.length === 0) {
    return { considered: 0, created: 0 };
  }

  const result = await tx.occurrence.createMany({
    data: calculated.map(toOccurrenceCreateInput),
    skipDuplicates: true,
  });

  return { considered: calculated.length, created: result.count };
}

function toOccurrenceCreateInput(
  occurrence: CalculatedOccurrence
): Prisma.OccurrenceCreateManyInput {
  return {
    accountId: occurrence.accountId,
    type: occurrence.type,
    status: "PLANNED",
    incomeSourceId: occurrence.incomeSourceId,
    plannedExpenseId: occurrence.plannedExpenseId,
    anchorDate: occurrence.anchorDate,
    dueDate: occurrence.dueDate,
    plannedAmount: new Prisma.Decimal(occurrence.plannedAmount),
    effectiveAmount: new Prisma.Decimal(occurrence.effectiveAmount),
    identityKey: occurrence.identityKey,
    nameSnapshot: occurrence.nameSnapshot,
    categorySnapshot: occurrence.categorySnapshot,
    originalRuleId: occurrence.originalRuleId,
  };
}
