import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { processDueOccurrencesForAccount } from "./occurrenceProcessing";
import {
  softDeleteActualTransaction,
  softDeleteActualTransactionInTransaction,
  updateActualTransaction,
} from "./actualTransactionService";

const prisma = new PrismaClient();
const accountId = "actual-transaction-service-test-account";
const incomeId = "actual-transaction-service-test-income";
const date = (value: string) => new Date(`${value}T00:00:00Z`);

describe("softDeleteActualTransaction", () => {
  beforeAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.account.create({ data: { id: accountId, name: "Actual transaction service test" } });
    await prisma.incomeSource.create({
      data: { id: incomeId, accountId, name: "Income", amount: 100, interval: "DAILY", startDate: date("2026-10-26") },
    });
  });

  beforeEach(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.incomeSource.update({ where: { id: incomeId }, data: { active: true } });
  });

  afterAll(async () => {
    await prisma.actualTransaction.deleteMany({ where: { accountId } });
    await prisma.occurrence.deleteMany({ where: { accountId } });
    await prisma.balanceSnapshot.deleteMany({ where: { accountId } });
    await prisma.incomeSource.deleteMany({ where: { accountId } });
    await prisma.account.delete({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it("soft-deletes a completed automatic transaction and skips its occurrence", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));
    const transaction = await prisma.actualTransaction.findFirstOrThrow({ where: { accountId } });

    const deleted = await softDeleteActualTransaction(prisma, accountId, transaction.id);

    expect(deleted.deletedAt).toEqual(expect.any(Date));
    expect(deleted.occurrence?.status).toBe("SKIPPED");
    const result = await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));
    expect(result?.transactionsCreated).toBe(0);
    await expect(prisma.actualTransaction.count({ where: { accountId } })).resolves.toBe(1);
  });

  it("soft-deletes a manual transaction without changing occurrences", async () => {
    const transaction = await prisma.actualTransaction.create({
      data: { accountId, type: "INCOME", origin: "MANUAL", amount: 25, occurredAt: date("2026-10-27") },
    });

    const deleted = await softDeleteActualTransaction(prisma, accountId, transaction.id);

    expect(deleted.deletedAt).toEqual(expect.any(Date));
    expect(deleted.occurrenceId).toBeNull();
    await expect(prisma.occurrence.count({ where: { accountId } })).resolves.toBe(0);
  });

  it("updates an automatic transaction without changing its occurrence", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));
    const transaction = await prisma.actualTransaction.findFirstOrThrow({ where: { accountId } });
    const occurrence = await prisma.occurrence.findUniqueOrThrow({ where: { id: transaction.occurrenceId! } });

    const updated = await updateActualTransaction(prisma, accountId, transaction.id, {
      amount: 77,
      note: "Corrected description",
      occurredAt: date("2026-10-27"),
    });

    expect(updated.amount.toString()).toBe("77");
    expect(updated.note).toBe("Corrected description");
    expect(updated.occurredAt).toEqual(date("2026-10-27"));
    await expect(prisma.occurrence.findUniqueOrThrow({ where: { id: occurrence.id } })).resolves.toMatchObject({
      status: "COMPLETED",
      dueDate: occurrence.dueDate,
    });
  });

  it("is idempotent for an already soft-deleted transaction", async () => {
    const transaction = await prisma.actualTransaction.create({
      data: { accountId, type: "EXPENSE", origin: "MANUAL", amount: 25, occurredAt: date("2026-10-27") },
    });
    const first = await softDeleteActualTransaction(prisma, accountId, transaction.id);

    const second = await softDeleteActualTransaction(prisma, accountId, transaction.id);

    expect(second.deletedAt).toEqual(first.deletedAt);
  });

  it("rolls back the soft-delete and status change together", async () => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));
    const transaction = await prisma.actualTransaction.findFirstOrThrow({ where: { accountId } });

    await expect(prisma.$transaction(async (tx) => {
      await softDeleteActualTransactionInTransaction(tx, accountId, transaction.id);
      throw new Error("forced rollback");
    })).rejects.toThrow("forced rollback");

    await expect(prisma.actualTransaction.findUniqueOrThrow({ where: { id: transaction.id } })).resolves.toMatchObject({ deletedAt: null });
    await expect(prisma.occurrence.findUniqueOrThrow({ where: { id: transaction.occurrenceId! } })).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it.each(["CANCELLED", "SKIPPED"] as const)("does not overwrite a %s occurrence", async (status) => {
    await prisma.balanceSnapshot.create({ data: { accountId, amount: 1000, date: date("2026-10-26") } });
    await processDueOccurrencesForAccount(prisma, accountId, date("2026-10-27"));
    const transaction = await prisma.actualTransaction.findFirstOrThrow({ where: { accountId } });
    await prisma.occurrence.update({ where: { id: transaction.occurrenceId! }, data: { status } });

    await softDeleteActualTransaction(prisma, accountId, transaction.id);

    await expect(prisma.occurrence.findUniqueOrThrow({ where: { id: transaction.occurrenceId! } })).resolves.toMatchObject({ status });
  });

  it("does not partially update data when the transaction is not owned by the account", async () => {
    const transaction = await prisma.actualTransaction.create({
      data: { accountId, type: "INCOME", origin: "MANUAL", amount: 25, occurredAt: date("2026-10-27") },
    });

    await expect(softDeleteActualTransaction(prisma, "different-account", transaction.id)).rejects.toThrow(
      "Actual transaction not found"
    );
    await expect(prisma.actualTransaction.findUniqueOrThrow({ where: { id: transaction.id } })).resolves.toMatchObject({ deletedAt: null });
  });
});