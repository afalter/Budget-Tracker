import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { validateRuleSheet } from "./spreadsheet";
import prisma from "../lib/prisma";
import { runImportTransaction } from "./spreadsheet";

describe("spreadsheet rule validation", () => {
  it("accepts an empty sheet with only its header", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Income Sources");
    sheet.addRow(["ID", "Name", "Amount", "Interval", "Start Date", "Active"]);

    expect(() => validateRuleSheet(sheet, "Income")).not.toThrow();
  });

  it("rejects an invalid row even when it has an existing ID", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Income Sources");
    sheet.addRow(["ID", "Name", "Amount", "Interval", "Start Date", "Active"]);
    sheet.addRow(["existing-id", "Salary", "not-a-number", "MONTHLY", "2026-01-01", true]);

    expect(() => validateRuleSheet(sheet, "Income")).toThrow("Income row 2: invalid amount");
  });

  it("does not mutate the workbook or database while validating", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Planned Expenses");
    sheet.addRow(["ID", "Name", "Amount", "Interval", "Start Date"]);
    sheet.addRow(["existing-id", "Rent", "invalid", "MONTHLY", "2026-01-01"]);

    expect(() => validateRuleSheet(sheet, "Expense")).toThrow();
    expect(sheet.getCell("A2").value).toBe("existing-id");
  });
});

describe("real Prisma import transaction", () => {
  it("rolls back a prior mutation after a later failure", async () => {
    const account = await prisma.account.create({ data: { name: "spreadsheet-test-rollback" } });
    try {
      await expect(runImportTransaction(async (tx) => {
        await tx.balanceSnapshot.create({ data: { amount: 123, accountId: account.id } });
        throw new Error("intentional late import failure");
      })).rejects.toThrow("intentional late import failure");

      await expect(prisma.balanceSnapshot.count({ where: { accountId: account.id } })).resolves.toBe(0);
    } finally {
      await prisma.account.delete({ where: { id: account.id } });
    }
  });

  it("commits a successful import transaction", async () => {
    const account = await prisma.account.create({ data: { name: "spreadsheet-test-commit" } });
    try {
      await runImportTransaction(async (tx) => {
        await tx.balanceSnapshot.create({ data: { amount: 456, accountId: account.id } });
      });

      await expect(prisma.balanceSnapshot.count({ where: { accountId: account.id } })).resolves.toBe(1);
    } finally {
      await prisma.account.delete({ where: { id: account.id } });
    }
  });
});
