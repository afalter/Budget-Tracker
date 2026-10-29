import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { persistOccurrences } from "./occurrencePersistence";
import type { ExpenseOccurrenceRule, IncomeOccurrenceRule } from "./occurrenceGenerator";

const prisma = new PrismaClient();
const accountId = "occ-persist-test-account";
const incomeId = "occ-persist-test-income";
const expenseId = "occ-persist-test-expense";
const transferId = "occ-persist-test-transfer";
const date = (value: string) => new Date(`${value}T00:00:00Z`);

const incomeRule: IncomeOccurrenceRule = {
  id: incomeId,
  accountId,
  sourceType: "INCOME_SOURCE",
  name: "Test income",
  amount: 100,
  interval: "MONTHLY",
  startDate: date("2026-01-31"),
  active: true,
};

const expenseRule: ExpenseOccurrenceRule = {
  id: expenseId,
  accountId,
  sourceType: "PLANNED_EXPENSE",
  name: "Test expense",
  amount: 40,
  interval: "ONE_TIME",
  startDate: date("2026-02-01"),
  endDate: date("2026-02-01"),
  active: true,
  category: "Test",
};

const transferRule: ExpenseOccurrenceRule = {
  ...expenseRule,
  id: transferId,
  isTransfer: true,
};

describe("persistOccurrences", () => {
  beforeAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { id: incomeId, accountId } });
    await prisma.plannedExpense.deleteMany({ where: { id: { in: [expenseId, transferId] }, accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.account.create({ data: { id: accountId, name: "Occurrence persistence test" } });
    await prisma.incomeSource.create({
      data: { id: incomeId, accountId, name: incomeRule.name, amount: incomeRule.amount, interval: incomeRule.interval, startDate: incomeRule.startDate },
    });
    await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: expenseRule.name, amount: expenseRule.amount, interval: expenseRule.interval, startDate: expenseRule.startDate, endDate: expenseRule.endDate, category: expenseRule.category },
    });
    await prisma.plannedExpense.create({
      data: { id: transferId, accountId, name: transferRule.name, amount: transferRule.amount, interval: transferRule.interval, startDate: transferRule.startDate, isTransfer: true },
    });
  });

  afterAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { id: incomeId, accountId } });
    await prisma.plannedExpense.deleteMany({ where: { id: { in: [expenseId, transferId] }, accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it("creates income and expense occurrences with inclusive date limits", async () => {
    const result = await persistOccurrences(
      prisma,
      [incomeRule, expenseRule, transferRule],
      date("2026-01-31"),
      date("2026-02-01")
    );

    expect(result.created).toBe(2);
    const rows = await prisma.occurrence.findMany({ where: { accountId }, orderBy: { identityKey: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status)).toEqual(["PLANNED", "PLANNED"]);
    expect(rows.some((row) => row.incomeSourceId === incomeId)).toBe(true);
    expect(rows.some((row) => row.plannedExpenseId === expenseId)).toBe(true);
    expect(rows.some((row) => row.plannedExpenseId === transferId)).toBe(false);
  });

  it("is idempotent and preserves an existing status and snapshot", async () => {
    const first = await persistOccurrences(prisma, [incomeRule], date("2026-01-31"), date("2026-02-28"));
    expect(first.created).toBe(1);

    const existing = await prisma.occurrence.findFirstOrThrow({ where: { incomeSourceId: incomeId } });
    await prisma.occurrence.update({
      where: { id: existing.id },
      data: { status: "COMPLETED", nameSnapshot: "Historical snapshot" },
    });

    const second = await persistOccurrences(
      prisma,
      [{ ...incomeRule, name: "Changed rule name" }],
      date("2026-01-31"),
      date("2026-02-28")
    );
    expect(second.created).toBe(0);
    await expect(prisma.occurrence.findUniqueOrThrow({ where: { id: existing.id } })).resolves.toMatchObject({
      status: "COMPLETED",
      nameSnapshot: "Historical snapshot",
    });
  });

  it("handles concurrent persistence calls without duplicate rows", async () => {
    await prisma.occurrence.deleteMany({ where: { incomeSourceId: incomeId } });
    const results = await Promise.all([
      persistOccurrences(prisma, [incomeRule], date("2026-01-31"), date("2026-03-31")),
      persistOccurrences(prisma, [incomeRule], date("2026-01-31"), date("2026-03-31")),
    ]);

    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(3);
    await expect(prisma.occurrence.count({ where: { incomeSourceId: incomeId } })).resolves.toBe(3);
  });
});
