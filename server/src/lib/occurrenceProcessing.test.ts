import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { processDueOccurrencesForAccount } from "./occurrenceProcessing";
import { persistAccountOccurrences } from "./occurrenceService";

const prisma = new PrismaClient();
const accountId = "occ-processing-test-account";
const incomeId = "occ-processing-income";
const expenseId = "occ-processing-expense";
const date = (value: string) => new Date(`${value}T00:00:00Z`);

describe("processDueOccurrencesForAccount", () => {
  beforeAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { accountId } });
    await prisma.plannedExpense.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.account.create({ data: { id: accountId, name: "Occurrence processing test" } });
    await prisma.incomeSource.create({
      data: { id: incomeId, accountId, name: "Income", amount: 100, interval: "DAILY", startDate: date("2026-10-25") },
    });
    await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: "Expense", amount: 40, interval: "DAILY", startDate: date("2026-10-25") },
    });
  });

  beforeEach(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.incomeSource.update({ where: { id: incomeId }, data: { active: true } });
    await prisma.plannedExpense.update({ where: { id: expenseId }, data: { active: true } });
  });

  afterAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { accountId } });
    await prisma.plannedExpense.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it("does nothing without a balance snapshot", async () => {
    await expect(processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"))).resolves.toBeNull();
    await expect(prisma.occurrence.count({ where: { accountId } })).resolves.toBe(0);
  });

  it("books the range after the snapshot and calculates income and expense direction", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-25") } });

    const result = await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));

    expect(result).toMatchObject({ transactionsCreated: 4, occurrencesCreated: 4 });
    expect(result?.fromDate).toEqual(date("2026-10-26"));
    expect(result?.balance.toString()).toBe("1120");
    await expect(prisma.actualTransaction.count({ where: { accountId } })).resolves.toBe(4);
    await expect(prisma.occurrence.count({ where: { accountId, status: "COMPLETED" } })).resolves.toBe(4);
  });

  it("is idempotent and preserves manually corrected transactions", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    const first = await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));
    const incomeOccurrence = await prisma.occurrence.findFirstOrThrow({ where: { accountId, incomeSourceId: incomeId } });
    const transaction = await prisma.actualTransaction.findUniqueOrThrow({ where: { occurrenceId: incomeOccurrence.id } });
    await prisma.actualTransaction.update({ where: { id: transaction.id }, data: { amount: 77, occurredAt: date("2026-10-26") } });

    const second = await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));

    expect(first?.transactionsCreated).toBe(2);
    expect(second?.transactionsCreated).toBe(0);
    expect(second?.balance.toString()).toBe("960");
    const preserved = await prisma.actualTransaction.findUniqueOrThrow({ where: { id: transaction.id } });
    expect(preserved.amount.toString()).toBe("77");
    expect(preserved.occurredAt).toEqual(date("2026-10-26"));
  });

  it("reconciles only transactions after the snapshot through today", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await prisma.actualTransaction.createMany({
      data: [
        { accountId, type: "INCOME", origin: "MANUAL", amount: 999, occurredAt: date("2026-10-26") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 50, occurredAt: date("2026-10-27") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 500, occurredAt: date("2026-10-28") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 700, occurredAt: new Date("2026-10-27T23:59:59.999Z") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 300, occurredAt: new Date("2026-10-28T00:00:00.000Z") },
      ],
    });
    const deleted = await prisma.actualTransaction.create({
      data: { accountId, type: "INCOME", origin: "MANUAL", amount: 800, occurredAt: date("2026-10-27"), deletedAt: new Date() },
    });
    await prisma.incomeSource.update({ where: { id: incomeId }, data: { active: false } });
    await prisma.plannedExpense.update({ where: { id: expenseId }, data: { active: false } });

    const result = await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));

    expect(result?.balance.toString()).toBe("1750");
    await expect(prisma.actualTransaction.findUniqueOrThrow({ where: { id: deleted.id } })).resolves.toMatchObject({ deletedAt: expect.any(Date) });
  });

  it("does not recreate a soft-deleted automatic transaction", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));
    const transaction = await prisma.actualTransaction.findFirstOrThrow({ where: { accountId, origin: "AUTOMATIC" } });
    await prisma.actualTransaction.update({ where: { id: transaction.id }, data: { deletedAt: new Date() } });
    await prisma.occurrence.update({ where: { id: transaction.occurrenceId! }, data: { status: "PLANNED" } });

    const result = await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));

    expect(result?.transactionsCreated).toBe(0);
    expect(result?.skippedDeletedTransactions).toBe(1);
    await expect(prisma.occurrence.findUniqueOrThrow({ where: { id: transaction.occurrenceId! } })).resolves.toMatchObject({ status: "SKIPPED" });
    await expect(prisma.actualTransaction.count({ where: { accountId } })).resolves.toBe(2);
  });

  it("processes overdue occurrences on their original due date and remains idempotent", async () => {
    const dueDate = date("2026-10-25");
    const today = date("2026-10-27");
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-24") } });
    await prisma.incomeSource.update({ where: { id: incomeId }, data: { active: false } });
    await prisma.plannedExpense.update({ where: { id: expenseId }, data: { active: false } });
    await prisma.occurrence.create({
      data: {
        accountId,
        type: "EXPENSE",
        status: "PLANNED",
        plannedExpenseId: expenseId,
        anchorDate: dueDate,
        dueDate,
        plannedAmount: 40,
        effectiveAmount: 40,
        identityKey: "PLANNED_EXPENSE:occ-processing-overdue:2026-10-25",
        nameSnapshot: "Expense",
        originalRuleId: expenseId,
      },
    });

    const first = await processDueOccurrencesForAccount(prisma, accountId, today);
    const occurrence = await prisma.occurrence.findFirstOrThrow({
      where: { accountId, dueDate },
    });
    const transaction = await prisma.actualTransaction.findUniqueOrThrow({
      where: { occurrenceId: occurrence.id },
    });

    expect(first?.transactionsCreated).toBe(1);
    expect(transaction.occurredAt).toEqual(dueDate);
    await expect(prisma.occurrence.findUniqueOrThrow({ where: { id: occurrence.id } })).resolves.toMatchObject({ status: "COMPLETED" });

    const second = await processDueOccurrencesForAccount(prisma, accountId, today);

    expect(second?.transactionsCreated).toBe(0);
    await expect(prisma.actualTransaction.count({ where: { accountId } })).resolves.toBe(1);
  });

  it("does not process completed, skipped, or cancelled occurrences", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await persistAccountOccurrences(prisma, accountId, date("2026-10-27"), date("2026-10-27"));
    const extraOccurrence = await prisma.occurrence.create({
      data: {
        accountId,
        type: "EXPENSE",
        plannedExpenseId: expenseId,
        anchorDate: date("2026-10-25"),
        dueDate: date("2026-10-27"),
        plannedAmount: 40,
        effectiveAmount: 40,
        identityKey: "PLANNED_EXPENSE:occ-processing-extra:2026-10-27",
        nameSnapshot: "Extra expense",
        originalRuleId: expenseId,
      },
    });
    const occurrences = await prisma.occurrence.findMany({ where: { accountId }, orderBy: { identityKey: "asc" } });
    await prisma.occurrence.update({ where: { id: occurrences[0].id }, data: { status: "COMPLETED" } });
    await prisma.occurrence.update({ where: { id: occurrences[1].id }, data: { status: "SKIPPED" } });
    await prisma.occurrence.update({ where: { id: extraOccurrence.id }, data: { status: "CANCELLED" } });

    const result = await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));

    expect(result?.transactionsCreated).toBe(0);
    await expect(prisma.actualTransaction.count({ where: { accountId } })).resolves.toBe(0);
  });

  it("serializes parallel calls and creates one transaction per occurrence", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });

    const results = await Promise.all([
      processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27")),
      processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27")),
    ]);

    expect(results.reduce((sum, result) => sum + (result?.transactionsCreated ?? 0), 0)).toBe(2);
    await expect(prisma.actualTransaction.count({ where: { accountId } })).resolves.toBe(2);
  });

  it("rolls back occurrence persistence when a rule fails validation", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await prisma.incomeSource.update({ where: { id: incomeId }, data: { amount: -1 } });

    await expect(processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"))).rejects.toThrow(
      "rule amount must be a non-negative finite number"
    );
    await expect(prisma.occurrence.count({ where: { accountId } })).resolves.toBe(0);
    await expect(prisma.actualTransaction.count({ where: { accountId } })).resolves.toBe(0);
    await prisma.incomeSource.update({ where: { id: incomeId }, data: { amount: 100 } });
  });
});