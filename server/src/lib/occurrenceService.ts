import { Prisma, PrismaClient } from "@prisma/client";
import { persistOccurrencesInTransaction, type PersistOccurrencesResult } from "./occurrencePersistence";
import type { ExpenseOccurrenceRule, IncomeOccurrenceRule, OccurrenceRule } from "./occurrenceGenerator";

/**
 * Load active account rules and persist their planned occurrences for the
 * caller-supplied inclusive UTC date range. This service has no implicit
 * horizon and does not create actual transactions or modify forecast data.
 */
export async function persistAccountOccurrences(
  db: PrismaClient,
  accountId: string,
  fromDate: Date,
  throughDate: Date
): Promise<PersistOccurrencesResult> {
  return db.$transaction((tx) =>
    persistAccountOccurrencesInTransaction(tx, accountId, fromDate, throughDate)
  );
}

export async function persistAccountOccurrencesInTransaction(
  tx: Prisma.TransactionClient,
  accountId: string,
  fromDate: Date,
  throughDate: Date
): Promise<PersistOccurrencesResult> {
  const rules = await loadActiveAccountRules(tx, accountId);
  return persistOccurrencesInTransaction(tx, rules, fromDate, throughDate);
}

async function loadActiveAccountRules(
  tx: Prisma.TransactionClient,
  accountId: string
): Promise<OccurrenceRule[]> {
  const [incomeSources, expenses] = await Promise.all([
    tx.incomeSource.findMany({ where: { accountId, active: true } }),
    tx.plannedExpense.findMany({
      where: { accountId, active: true },
      include: { priceAdjustments: { orderBy: { startDate: "asc" } } },
    }),
  ]);

  return [
    ...incomeSources.map(toIncomeRule),
    ...expenses.map(toExpenseRule),
  ];
}

function toIncomeRule(source: {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  interval: IncomeOccurrenceRule["interval"];
  startDate: Date;
  active: boolean;
}): IncomeOccurrenceRule {
  return {
    id: source.id,
    accountId: source.accountId,
    sourceType: "INCOME_SOURCE",
    name: source.name,
    amount: source.amount,
    interval: source.interval,
    startDate: source.startDate,
    active: source.active,
  };
}

function toExpenseRule(expense: {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  interval: ExpenseOccurrenceRule["interval"];
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  category: string | null;
  isVariable: boolean;
  isTransfer: boolean;
  priceAdjustments: { amount: number; startDate: Date }[];
}): ExpenseOccurrenceRule {
  return {
    id: expense.id,
    accountId: expense.accountId,
    sourceType: "PLANNED_EXPENSE",
    name: expense.name,
    amount: expense.amount,
    interval: expense.interval,
    startDate: expense.startDate,
    endDate: expense.endDate,
    active: expense.active,
    category: expense.category,
    isVariable: expense.isVariable,
    isTransfer: expense.isTransfer,
    priceAdjustments: expense.priceAdjustments,
  };
}
