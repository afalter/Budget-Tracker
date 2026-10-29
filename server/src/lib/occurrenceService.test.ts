import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  persistAccountOccurrences,
  persistAccountOccurrencesInTransaction,
} from "./occurrenceService";

const prisma = new PrismaClient();
const accountId = "occ-service-test-account";
const incomeId = "occ-service-test-income";
const inactiveIncomeId = "occ-service-test-inactive-income";
const expenseId = "occ-service-test-expense";
const transferId = "occ-service-test-transfer";
const date = (value: string) => new Date(`${value}T00:00:00Z`);

describe("persistAccountOccurrences", () => {
  beforeAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { accountId } });
    await prisma.plannedExpense.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.account.create({ data: { id: accountId, name: "Occurrence service test" } });
    await prisma.incomeSource.createMany({
      data: [
        { id: incomeId, accountId, name: "Active income", amount: 100, interval: "MONTHLY", startDate: date("2026-01-31"), active: true },
        { id: inactiveIncomeId, accountId, name: "Archived income", amount: 200, interval: "DAILY", startDate: date("2026-01-31"), active: false },
      ],
    });
    await prisma.plannedExpense.createMany({
      data: [
        { id: expenseId, accountId, name: "Active expense", amount: 40, interval: "ONE_TIME", startDate: date("2026-02-01"), endDate: date("2026-02-01"), active: true, category: "Test" },
        { id: transferId, accountId, name: "Transfer", amount: 50, interval: "DAILY", startDate: date("2026-01-31"), active: true, isTransfer: true },
      ],
    });
  });

  afterAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { accountId } });
    await prisma.plannedExpense.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it("loads only active rules, excludes transfers, and respects the explicit range", async () => {
    const result = await persistAccountOccurrences(
      prisma,
      accountId,
      date("2026-01-31"),
      date("2026-02-01")
    );

    expect(result.created).toBe(2);
    const rows = await prisma.occurrence.findMany({ where: { accountId } });
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.incomeSourceId === incomeId)).toBe(true);
    expect(rows.some((row) => row.plannedExpenseId === expenseId)).toBe(true);
    expect(rows.some((row) => row.incomeSourceId === inactiveIncomeId)).toBe(false);
    expect(rows.some((row) => row.plannedExpenseId === transferId)).toBe(false);
    expect(rows.every((row) => row.dueDate >= date("2026-01-31") && row.dueDate <= date("2026-02-01"))).toBe(true);
  });

  it("runs the same scoped rule resolution inside an existing transaction", async () => {
    await prisma.occurrence.deleteMany({ where: { accountId } });

    const result = await prisma.$transaction((tx) =>
      persistAccountOccurrencesInTransaction(tx, accountId, date("2026-01-31"), date("2026-02-01"))
    );

    expect(result.created).toBe(2);
    const rows = await prisma.occurrence.findMany({ where: { accountId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.accountId === accountId)).toBe(true);
    expect(rows.some((row) => row.incomeSourceId === inactiveIncomeId)).toBe(false);
    expect(rows.some((row) => row.plannedExpenseId === transferId)).toBe(false);
  });

  it("is repeatable and preserves existing occurrences", async () => {
    const first = await persistAccountOccurrences(prisma, accountId, date("2026-01-31"), date("2026-02-01"));
    const existing = await prisma.occurrence.findFirstOrThrow({ where: { accountId, incomeSourceId: incomeId } });
    await prisma.occurrence.update({ where: { id: existing.id }, data: { status: "COMPLETED", nameSnapshot: "Historical" } });

    const second = await persistAccountOccurrences(prisma, accountId, date("2026-01-31"), date("2026-02-01"));

    expect(first.created).toBe(0);
    expect(second.created).toBe(0);
    await expect(prisma.occurrence.findUniqueOrThrow({ where: { id: existing.id } })).resolves.toMatchObject({
      status: "COMPLETED",
      nameSnapshot: "Historical",
    });
  });
});
