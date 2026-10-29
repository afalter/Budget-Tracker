import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { applyDay, buildActualTransactionProjectionData, calculateBalanceAt, calculateCurrentBalance, isHistoricalWindow } from "./projections";

const prisma = new PrismaClient();
const accountId = "projections-balance-test-account";
const expenseId = "projections-balance-test-expense";
const date = (value: string) => new Date(`${value}T00:00:00Z`);

describe("calculateCurrentBalance", () => {
  beforeAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.plannedExpense.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.account.create({ data: { id: accountId, name: "Projection balance test" } });
  });

  beforeEach(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.plannedExpense.deleteMany({ where: { accountId } });
  });

  afterAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.plannedExpense.deleteMany({ where: { accountId } });
    await prisma.account.delete({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it("uses stored transactions in the snapshot-to-today interval", async () => {
    const snapshot = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1000, date: date("2026-10-25") },
    });
    await prisma.actualTransaction.createMany({
      data: [
        { accountId, type: "INCOME", origin: "MANUAL", amount: 100, occurredAt: date("2026-10-25") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 200, occurredAt: date("2026-10-26") },
        { accountId, type: "EXPENSE", origin: "MANUAL", amount: 50, occurredAt: new Date("2026-10-27T23:59:59.999Z") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 500, occurredAt: date("2026-10-28") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 700, occurredAt: date("2026-10-26"), deletedAt: new Date() },
      ],
    });

    await expect(calculateCurrentBalance(prisma, accountId, snapshot, date("2026-10-27"))).resolves.toBe(1150);
  });

  it("excludes snapshot-day and future transactions from the current balance", async () => {
    const snapshot = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1000, date: date("2026-10-26") },
    });
    await prisma.actualTransaction.createMany({
      data: [
        { accountId, type: "EXPENSE", origin: "MANUAL", amount: 100, occurredAt: date("2026-10-26") },
        { accountId, type: "EXPENSE", origin: "MANUAL", amount: 50, occurredAt: date("2026-10-28") },
      ],
    });

    await expect(calculateCurrentBalance(prisma, accountId, snapshot, date("2026-10-27"))).resolves.toBe(1000);
  });

  it("uses corrected amounts and keeps manual transactions without occurrenceId", async () => {
    const snapshot = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 500, date: date("2026-10-26") },
    });
    await prisma.actualTransaction.create({
      data: { accountId, type: "INCOME", origin: "MANUAL", amount: 77, occurredAt: date("2026-10-27") },
    });

    await expect(calculateCurrentBalance(prisma, accountId, snapshot, date("2026-10-27"))).resolves.toBe(577);
  });

  it("calculates a historical start balance before the window", async () => {
    const snapshot = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1000, date: date("2026-10-20") },
    });
    await prisma.actualTransaction.createMany({
      data: [
        { accountId, type: "INCOME", origin: "MANUAL", amount: 50, occurredAt: date("2026-10-21") },
        { accountId, type: "EXPENSE", origin: "MANUAL", amount: 100, occurredAt: date("2026-10-23") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 500, occurredAt: date("2026-10-25") },
        { accountId, type: "INCOME", origin: "MANUAL", amount: 700, occurredAt: date("2026-10-21"), deletedAt: new Date() },
      ],
    });

    await expect(calculateBalanceAt(prisma, accountId, snapshot, date("2026-10-22"))).resolves.toBe(1050);
  });

  it("uses the latest snapshot not later than a historical window", async () => {
    await prisma.balanceSnapshot.createMany({
      data: [
        { accountId, amount: 1000, date: date("2026-10-20") },
        { accountId, amount: 2000, date: date("2026-10-27") },
      ],
    });
    const snapshot = await prisma.balanceSnapshot.findFirstOrThrow({
      where: { accountId, date: { lt: date("2026-10-23") } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(snapshot.amount).toBe(1000);
  });

  it("does not provide a historical basis from a later snapshot", async () => {
    await prisma.balanceSnapshot.create({
      data: { accountId, amount: 2000, date: date("2026-10-27") },
    });
    const snapshot = await prisma.balanceSnapshot.findFirst({
      where: { accountId, date: { lt: date("2026-10-23") } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(snapshot).toBeNull();
    expect(isHistoricalWindow(date("2026-10-22"), date("2026-10-27"))).toBe(true);
  });

  it("keeps the newest created snapshot when the historical date matches", async () => {
    const older = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1000, date: date("2026-10-20"), createdAt: new Date("2026-10-20T10:00:00Z") },
    });
    await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1200, date: date("2026-10-20"), createdAt: new Date("2026-10-20T11:00:00Z") },
    });
    const snapshot = await prisma.balanceSnapshot.findFirstOrThrow({
      where: { accountId, date: { lt: date("2026-10-23") } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(snapshot.id).not.toBe(older.id);
    expect(snapshot.amount).toBe(1200);
  });

  it("applies a historical transaction once on its occurredAt date", () => {
    const windowStart = date("2026-10-22");
    const transactionDate = date("2026-10-23");
    const { actualTransactionsByDate } = buildActualTransactionProjectionData([{
      type: "EXPENSE", amount: 100, occurredAt: transactionDate, deletedAt: null,
      note: "Historical expense", category: null, occurrence: null,
    }], windowStart, true);
    const day = applyDay(transactionDate, 1050, [], [], [], [], new Set(), actualTransactionsByDate.get("2026-10-23"));

    expect(day.balance).toBe(950);
    expect(day.events).toEqual([{ type: "expense", name: "Historical expense", amount: 100, isActual: true }]);
  });

  it("selects the newest snapshot and does not invent transaction balance without one", async () => {
    const older = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1000, date: date("2026-10-26") },
    });
    await prisma.balanceSnapshot.create({
      data: { accountId, amount: 2000, date: date("2026-10-26") },
    });
    const newest = await prisma.balanceSnapshot.findFirstOrThrow({
      where: { accountId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(newest.id).not.toBe(older.id);
    await expect(calculateCurrentBalance(prisma, accountId, newest, date("2026-10-27"))).resolves.toBe(2000);
  });

  it("does not count today's completed occurrence twice", async () => {
    const today = date("2026-10-27");
    const snapshot = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1000, date: date("2026-10-26") },
    });
    const expense = await prisma.plannedExpense.create({
      data: {
        id: expenseId,
        accountId,
        name: "Today's expense",
        amount: 100,
        interval: "ONE_TIME",
        startDate: today,
        active: true,
      },
    });
    const occurrence = await prisma.occurrence.create({
      data: {
        accountId,
        type: "EXPENSE",
        status: "COMPLETED",
        plannedExpenseId: expense.id,
        anchorDate: today,
        dueDate: today,
        plannedAmount: 100,
        effectiveAmount: 100,
        identityKey: `PLANNED_EXPENSE:${expense.id}:2026-10-27`,
        nameSnapshot: expense.name,
        originalRuleId: expense.id,
      },
    });
    await prisma.actualTransaction.create({
      data: {
        accountId,
        type: "EXPENSE",
        origin: "AUTOMATIC",
        amount: 100,
        occurredAt: today,
        occurrenceId: occurrence.id,
      },
    });

    const currentBalance = await calculateCurrentBalance(prisma, accountId, snapshot, today);
    const projection = applyDay(
      today,
      currentBalance,
      [],
      [{
        id: expense.id,
        interval: expense.interval,
        startDate: expense.startDate,
        endDate: expense.endDate,
        active: expense.active,
        name: expense.name,
        amount: expense.amount,
        category: expense.category,
        isVariable: expense.isVariable,
        isTransfer: expense.isTransfer,
        priceAdjustments: [],
      }],
      [],
      [],
      new Set([expense.id]),
    );

    expect(currentBalance).toBe(900);
    expect(projection.balance).toBe(900);
    expect(projection.events).toEqual([]);
  });

  it("replaces a completed income forecast with its actual transaction", () => {
    const today = date("2026-10-27");
    const projection = applyDay(today, 1000, [
      { id: "income-source", interval: "ONE_TIME", startDate: today, active: true, name: "Income", amount: 100 },
    ], [], [], [], new Set(), [{
      id: "actual-income",
      type: "INCOME",
      amount: 100,
      name: "Income",
      category: null,
      affectsBalance: true,
      incomeSourceId: "income-source",
    }]);

    expect(projection.events).toEqual([{
      id: "actual-income",
      type: "income",
      name: "Income",
      amount: 100,
      isActual: true,
      incomeSourceId: "income-source",
    }]);
    expect(projection.balance).toBe(1100);
  });

  it("keeps an income forecast without an actual", () => {
    const today = date("2026-10-27");
    const projection = applyDay(today, 1000, [
      { id: "income-source", interval: "ONE_TIME", startDate: today, active: true, name: "Income", amount: 100 },
    ], [], [], []);

    expect(projection.events).toEqual([{
      type: "income",
      name: "Income",
      amount: 100,
      incomeSourceId: "income-source",
    }]);
  });

  it("only replaces the fulfilled income forecast when multiple forecasts share a day", () => {
    const today = date("2026-10-27");
    const projection = applyDay(today, 1000, [
      { id: "fulfilled-income", interval: "ONE_TIME", startDate: today, active: true, name: "Fulfilled", amount: 100 },
      { id: "other-income", interval: "ONE_TIME", startDate: today, active: true, name: "Other", amount: 40 },
    ], [], [], [], new Set(), [{
      id: "actual-income",
      type: "INCOME",
      amount: 100,
      name: "Fulfilled",
      category: null,
      affectsBalance: true,
      incomeSourceId: "fulfilled-income",
    }]);

    expect(projection.events).toEqual([
      {
        type: "income",
        name: "Other",
        amount: 40,
        incomeSourceId: "other-income",
      },
      {
        id: "actual-income",
        type: "income",
        name: "Fulfilled",
        amount: 100,
        isActual: true,
        incomeSourceId: "fulfilled-income",
      },
    ]);
    expect(projection.balance).toBe(1140);
  });

  it("does not cover another planned expense on the same day", async () => {
    const today = date("2026-10-27");
    const expense = await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: "Covered", amount: 100, interval: "ONE_TIME", startDate: today },
    });
    const other = await prisma.plannedExpense.create({
      data: { id: `${expenseId}-other`, accountId, name: "Other", amount: 40, interval: "ONE_TIME", startDate: today },
    });
    const occurrence = await prisma.occurrence.create({
      data: {
        accountId, type: "EXPENSE", status: "COMPLETED", plannedExpenseId: expense.id,
        anchorDate: today, dueDate: today, plannedAmount: 100, effectiveAmount: 100,
        identityKey: `PLANNED_EXPENSE:${expense.id}:2026-10-27`, nameSnapshot: expense.name, originalRuleId: expense.id,
      },
    });
    await prisma.actualTransaction.create({
      data: { accountId, type: "EXPENSE", origin: "AUTOMATIC", amount: 100, occurredAt: today, occurrenceId: occurrence.id },
    });

    const projection = applyDay(today, 900, [], [
      { ...expense, category: expense.category, priceAdjustments: [] },
      { ...other, category: other.category, priceAdjustments: [] },
    ], [], [], new Set([expense.id]));

    expect(projection.balance).toBe(860);
    expect(projection.events).toEqual([{ type: "expense", name: "Other", amount: 40, forecastExpenseId: other.id }]);
  });

  it.each(["SKIPPED", "CANCELLED"] as const)("does not cover an expense for a %s occurrence", async (status) => {
    const today = date("2026-10-27");
    const expense = await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: "Not covered", amount: 100, interval: "ONE_TIME", startDate: today },
    });
    const occurrence = await prisma.occurrence.create({
      data: {
        accountId, type: "EXPENSE", status, plannedExpenseId: expense.id,
        anchorDate: today, dueDate: today, plannedAmount: 100, effectiveAmount: 100,
        identityKey: `PLANNED_EXPENSE:${expense.id}:2026-10-27`, nameSnapshot: expense.name, originalRuleId: expense.id,
      },
    });
    await prisma.actualTransaction.create({
      data: { accountId, type: "EXPENSE", origin: "AUTOMATIC", amount: 100, occurredAt: today, occurrenceId: occurrence.id },
    });

    const projection = applyDay(today, 1000, [], [{ ...expense, category: expense.category, priceAdjustments: [] }], [], []);

    expect(projection.balance).toBe(900);
    expect(projection.events).toEqual([{ type: "expense", name: "Not covered", amount: 100, forecastExpenseId: expense.id }]);
  });

  it("does not cover a planned expense for a soft-deleted transaction", async () => {
    const today = date("2026-10-27");
    const expense = await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: "Deleted actual", amount: 100, interval: "ONE_TIME", startDate: today },
    });
    const occurrence = await prisma.occurrence.create({
      data: {
        accountId, type: "EXPENSE", status: "COMPLETED", plannedExpenseId: expense.id,
        anchorDate: today, dueDate: today, plannedAmount: 100, effectiveAmount: 100,
        identityKey: `PLANNED_EXPENSE:${expense.id}:2026-10-27`, nameSnapshot: expense.name, originalRuleId: expense.id,
      },
    });
    await prisma.actualTransaction.create({
      data: { accountId, type: "EXPENSE", origin: "AUTOMATIC", amount: 100, occurredAt: today, occurrenceId: occurrence.id, deletedAt: new Date() },
    });

    const projection = applyDay(today, 1000, [], [{ ...expense, category: expense.category, priceAdjustments: [] }], [], []);

    expect(projection.balance).toBe(900);
    expect(projection.events).toEqual([{ type: "expense", name: "Deleted actual", amount: 100, forecastExpenseId: expense.id }]);
  });

  it("does not display or apply a soft-deleted actual transaction", async () => {
    const today = date("2026-10-27");
    const projectionData = buildActualTransactionProjectionData([{
      type: "EXPENSE", amount: 100, occurredAt: today, deletedAt: date("2026-10-28"), note: "Deleted", category: null,
      occurrence: { status: "COMPLETED", dueDate: today, plannedExpenseId: expenseId, nameSnapshot: "Deleted", categorySnapshot: null },
    }], today);
    const projection = applyDay(today, 1000, [], [], [], [], new Set(), projectionData.actualTransactionsByDate.get("2026-10-27"));

    expect(projection.balance).toBe(1000);
    expect(projection.events).toEqual([]);
  });

  it("keeps a same-day planned expense when the actual transaction is terminal", async () => {
    const today = date("2026-10-27");
    const expense = await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: "Terminal occurrence", amount: 100, interval: "ONE_TIME", startDate: today },
    });
    const projectionData = buildActualTransactionProjectionData([{
      type: "EXPENSE", amount: 100, occurredAt: today, deletedAt: null, note: null, category: null,
      occurrence: { status: "SKIPPED", dueDate: today, plannedExpenseId: expense.id, nameSnapshot: expense.name, categorySnapshot: null },
    }], today);
    const projection = applyDay(today, 1000, [], [{ ...expense, category: expense.category, priceAdjustments: [] }], [], [], projectionData.coveredExpensesByDate.get("2026-10-27"), projectionData.actualTransactionsByDate.get("2026-10-27"));

    expect(projection.balance).toBe(900);
    expect(projection.events).toEqual([{ type: "expense", name: "Terminal occurrence", amount: 100, forecastExpenseId: expense.id }]);
  });

  it("shows a completed actual transaction on its due date without applying it twice", async () => {
    const today = date("2026-10-27");
    const expense = await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: "Same-day actual", amount: 100, interval: "ONE_TIME", startDate: today },
    });
    const projectionData = buildActualTransactionProjectionData([{
      type: "EXPENSE", amount: 100, occurredAt: today, deletedAt: null, note: null, category: null,
      occurrence: { status: "COMPLETED", dueDate: today, plannedExpenseId: expense.id, nameSnapshot: expense.name, categorySnapshot: null },
    }], today);
    const projection = applyDay(today, 900, [], [{ ...expense, category: expense.category, priceAdjustments: [] }], [], [], projectionData.coveredExpensesByDate.get("2026-10-27"), projectionData.actualTransactionsByDate.get("2026-10-27"));

    expect(projection.balance).toBe(900);
    expect(projection.events).toEqual([{
      type: "expense",
      name: "Same-day actual",
      amount: 100,
      isActual: true,
    }]);
  });

  it("documents the current behavior when occurredAt differs from dueDate", async () => {
    const dueDate = date("2026-10-27");
    const occurredAt = date("2026-10-28");
    const snapshot = await prisma.balanceSnapshot.create({
      data: { accountId, amount: 1000, date: date("2026-10-26") },
    });
    const expense = await prisma.plannedExpense.create({
      data: { id: expenseId, accountId, name: "Moved expense", amount: 100, interval: "ONE_TIME", startDate: dueDate },
    });
    const occurrence = await prisma.occurrence.create({
      data: {
        accountId, type: "EXPENSE", status: "COMPLETED", plannedExpenseId: expense.id,
        anchorDate: dueDate, dueDate, plannedAmount: 100, effectiveAmount: 100,
        identityKey: `PLANNED_EXPENSE:${expense.id}:2026-10-27`, nameSnapshot: expense.name, originalRuleId: expense.id,
      },
    });
    await prisma.actualTransaction.create({
      data: { accountId, type: "EXPENSE", origin: "AUTOMATIC", amount: 100, occurredAt, occurrenceId: occurrence.id },
    });

    const currentBalance = await calculateCurrentBalance(prisma, accountId, snapshot, occurredAt);
    const projectionData = buildActualTransactionProjectionData([{
      type: "EXPENSE",
      amount: 100,
      occurredAt,
      deletedAt: null,
      note: null,
      category: null,
      occurrence: {
        status: "COMPLETED",
        dueDate,
        plannedExpenseId: expense.id,
        nameSnapshot: expense.name,
        categorySnapshot: null,
      },
    }], occurredAt);
    const dueDateProjection = applyDay(dueDate, currentBalance, [], [{ ...expense, category: expense.category, priceAdjustments: [] }], [], [], projectionData.coveredExpensesByDate.get("2026-10-27"));
    const occurredAtProjection = applyDay(occurredAt, currentBalance, [], [{ ...expense, category: expense.category, priceAdjustments: [] }], [], [], new Set(), projectionData.actualTransactionsByDate.get("2026-10-28"));

    expect(currentBalance).toBe(900);
    expect(dueDateProjection.balance).toBe(900);
    expect(dueDateProjection.events).toEqual([]);
    expect(occurredAtProjection.balance).toBe(900);
    expect(occurredAtProjection.events).toEqual([
      { type: "expense", name: "Moved expense", amount: 100, isActual: true },
    ]);
  });
});