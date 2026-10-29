import { Request, Router } from "express";
import ExcelJS from "exceljs";
import multer from "multer";
import prisma from "../lib/prisma";
import { Interval, IncomeSource, PlannedExpense, PriceAdjustment, Prisma } from "@prisma/client";
import { archiveIncomeSources, archivePlannedExpenses } from "../lib/archiveRules";

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const VALID_INTERVALS = Object.values(Interval);

export interface SpreadsheetImportResults {
  balance: { updated: boolean };
  income: { created: number; updated: number; deleted: number };
  expenses: { created: number; updated: number; deleted: number };
  priceAdjustments: { created: number; updated: number; deleted: number };
  actualSpends: { created: number; updated: number; deleted: number };
  categories: { created: number; updated: number };
  errors: string[];
}


class SpreadsheetValidationError extends Error {}

export async function runImportTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(work);
}

export function validateRuleSheet(
  sheet: ExcelJS.Worksheet,
  kind: "Income" | "Expense"
): void {
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;

    const name = String(row.getCell(2).value || "").trim();
    const hasData = name || row.getCell(1).value || row.getCell(3).value || row.getCell(4).value || row.getCell(5).value;
    if (!hasData) return;

    const amount = Number(row.getCell(3).value);
    const interval = String(row.getCell(4).value || "").trim().toUpperCase();
    const startDate = parseDate(row.getCell(5).value);
    const errors: string[] = [];
    if (!name) errors.push("name is required");
    if (!hasCellValue(row.getCell(3).value) || !Number.isFinite(amount)) errors.push("invalid amount");
    if (!VALID_INTERVALS.includes(interval as Interval)) errors.push(`invalid interval "${interval}"`);
    if (!startDate) errors.push("invalid start date");
    if (errors.length > 0) {
      throw new SpreadsheetValidationError(`${kind} row ${rowNum}: ${errors.join(", ")}`);
    }
  });
}


// ─── Color palette ───────────────────────────────────────────────────────────

const COLORS = {
  darkBlue: "1B2A4A",
  medBlue: "2D4A7A",
  lightBlue: "E8EEF7",
  white: "FFFFFF",
  green: "27AE60",
  lightGreen: "EAFAF1",
  red: "E74C3C",
  lightRed: "FDEDEC",
  orange: "F39C12",
  lightOrange: "FEF5E7",
  purple: "8E44AD",
  lightPurple: "F4ECF7",
  gray: "BDC3C7",
  lightGray: "F8F9FA",
  darkGray: "2C3E50",
  medGray: "7F8C8D",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function headerFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function headerFont(color = COLORS.white, size = 11): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: color }, size, name: "Calibri" };
}

function bodyFont(size = 11): Partial<ExcelJS.Font> {
  return { size, name: "Calibri", color: { argb: COLORS.darkGray } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COLORS.gray } };
  return { top: side, bottom: side, left: side, right: side };
}

function applyHeaderRow(sheet: ExcelJS.Worksheet, rowNum: number, fill: string) {
  const row = sheet.getRow(rowNum);
  row.eachCell((cell) => {
    cell.fill = headerFill(fill);
    cell.font = headerFont();
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 28;
}

function applyDataRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, altColor?: string) {
  for (let r = startRow; r <= endRow; r++) {
    const row = sheet.getRow(r);
    row.eachCell((cell) => {
      cell.font = bodyFont();
      cell.border = thinBorder();
      cell.alignment = { vertical: "middle" };
    });
    if (altColor && r % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = headerFill(altColor);
      });
    }
  }
}

function styleIdColumn(sheet: ExcelJS.Worksheet, colNum: number, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    const cell = sheet.getCell(r, colNum);
    cell.font = { ...bodyFont(9), color: { argb: COLORS.medGray } };
  }
}

function formatAsDate(sheet: ExcelJS.Worksheet, colNum: number, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    sheet.getCell(r, colNum).numFmt = "YYYY-MM-DD";
  }
}

function formatAsCurrency(sheet: ExcelJS.Worksheet, colNum: number, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    sheet.getCell(r, colNum).numFmt = '$#,##0.00';
  }
}

function addIntervalValidation(sheet: ExcelJS.Worksheet, colLetter: string, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    sheet.getCell(`${colLetter}${r}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${VALID_INTERVALS.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Invalid Interval",
      error: "Choose from: " + VALID_INTERVALS.join(", "),
    };
  }
}

function addBoolValidation(sheet: ExcelJS.Worksheet, colLetter: string, startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    sheet.getCell(`${colLetter}${r}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"TRUE,FALSE"'],
      showErrorMessage: true,
      errorTitle: "Invalid Value",
      error: "Enter TRUE or FALSE",
    };
  }
}

function toDateStr(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return toDateStr(val);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : toDateStr(d);
}

function parseBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  const s = String(val).trim().toUpperCase();
  return s === "TRUE" || s === "YES" || s === "1";
}

function hasCellValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function validateBoolean(value: unknown, label: string, errors: string[]): void {
  if (!hasCellValue(value)) return;
  if (typeof value === "boolean") return;
  const normalized = String(value).trim().toUpperCase();
  if (!["TRUE", "FALSE", "YES", "NO", "1", "0"].includes(normalized)) {
    errors.push(`${label}: invalid boolean`);
  }
}

function validateWorkbook(wb: ExcelJS.Workbook): void {
  const errors: string[] = [];

  const balanceSheet = wb.getWorksheet("Balance");
  if (balanceSheet) {
    const row = balanceSheet.getRow(2);
    const hasData = hasCellValue(row.getCell(1).value) || hasCellValue(row.getCell(2).value);
    if (hasData) {
      if (!hasCellValue(row.getCell(1).value) || !Number.isFinite(Number(row.getCell(1).value))) errors.push("Balance row 2: invalid amount");
      if (!parseDate(row.getCell(2).value)) errors.push("Balance row 2: invalid date");
    }
  }

  const incomeSheet = wb.getWorksheet("Income Sources");
  if (incomeSheet) validateRuleSheet(incomeSheet, "Income");

  const expenseSheet = wb.getWorksheet("Planned Expenses");
  if (expenseSheet) {
    validateRuleSheet(expenseSheet, "Expense");
    expenseSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const hasData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some((column) => hasCellValue(row.getCell(column).value));
      if (!hasData) return;
      const rowErrors: string[] = [];
      if (hasCellValue(row.getCell(6).value) && !parseDate(row.getCell(6).value)) rowErrors.push("invalid end date");
      validateBoolean(row.getCell(7).value, "active", rowErrors);
      validateBoolean(row.getCell(9).value, "isVariable", rowErrors);
      validateBoolean(row.getCell(10).value, "isTransfer", rowErrors);
      if (rowErrors.length > 0) errors.push(`Expense row ${rowNum}: ${rowErrors.join(", ")}`);
    });
  }

  const priceSheet = wb.getWorksheet("Price Adjustments");
  if (priceSheet) {
    priceSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const hasData = [1, 2, 3, 4, 5, 6].some((column) => hasCellValue(row.getCell(column).value));
      if (!hasData) return;
      const expenseName = String(row.getCell(2).value || "").trim();
      const expenseId = String(row.getCell(3).value || "").trim();
      const errorsForRow: string[] = [];
      if (!expenseName && !expenseId) errorsForRow.push("expense name or ID is required");
      if (!hasCellValue(row.getCell(4).value) || !Number.isFinite(Number(row.getCell(4).value))) errorsForRow.push("invalid amount");
      if (!parseDate(row.getCell(5).value)) errorsForRow.push("invalid start date");
      if (errorsForRow.length > 0) errors.push(`Price Adj row ${rowNum}: ${errorsForRow.join(", ")}`);
    });
  }

  const actualSheet = wb.getWorksheet("Actual Spending");
  if (actualSheet) {
    actualSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const hasData = [1, 2, 3, 4, 5, 6, 7].some((column) => hasCellValue(row.getCell(column).value));
      if (!hasData) return;
      const errorsForRow: string[] = [];
      if (!parseDate(row.getCell(2).value)) errorsForRow.push("invalid date");
      if (!hasCellValue(row.getCell(3).value) || !Number.isFinite(Number(row.getCell(3).value))) errorsForRow.push("invalid amount");
      if (errorsForRow.length > 0) errors.push(`Actual row ${rowNum}: ${errorsForRow.join(", ")}`);
    });
  }

  const categorySheet = wb.getWorksheet("Category Colors");
  if (categorySheet) {
    categorySheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const hasData = [1, 2, 3].some((column) => hasCellValue(row.getCell(column).value));
      if (!hasData) return;
      const name = String(row.getCell(1).value || "").trim();
      const color = String(row.getCell(2).value || "").trim();
      const errorsForRow: string[] = [];
      if (!name) errorsForRow.push("name is required");
      if (color && !/^#?[0-9a-f]{6}$/i.test(color)) errorsForRow.push("invalid color");
      if (errorsForRow.length > 0) errors.push(`Category row ${rowNum}: ${errorsForRow.join(", ")}`);
    });
  }

  if (errors.length > 0) throw new SpreadsheetValidationError(errors.join("; "));
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

router.get("/export", async (req: Request<{ accountId: string }>, res) => {
  try {
    const { accountId } = req.params;
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const [balanceSnap, incomes, expenses, actualSpends, categoryColors, allAccounts] = await Promise.all([
      prisma.balanceSnapshot.findFirst({ where: { accountId }, orderBy: { date: "desc" } }),
      prisma.incomeSource.findMany({ where: { accountId }, orderBy: { name: "asc" } }),
      prisma.plannedExpense.findMany({
        where: { accountId },
        include: { priceAdjustments: { orderBy: { startDate: "asc" } } },
        orderBy: { name: "asc" },
      }),
      prisma.actualSpend.findMany({
        where: { accountId },
        include: { forecastExpense: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.categoryColor.findMany({ orderBy: { name: "asc" } }),
      prisma.account.findMany({ select: { id: true, name: true } }),
    ]);

    const accountNameById = new Map(allAccounts.map((a) => [a.id, a.name]));

    const wb = new ExcelJS.Workbook();
    wb.creator = "Budget Tracker";
    wb.created = new Date();

    // ═══ Instructions Sheet ═══════════════════════════════════════════════════

    const instrSheet = wb.addWorksheet("Instructions", {
      properties: { tabColor: { argb: COLORS.darkBlue } },
    });
    instrSheet.properties.defaultColWidth = 90;

    const instructions = [
      ["BUDGET TRACKER — SPREADSHEET DATA EXCHANGE"],
      [""],
      ["This workbook contains all of your Budget Tracker data. You can review it,"],
      ["modify existing entries, or add new ones — then re-import to update your budget."],
      [""],
      ["HOW IT WORKS"],
      ["─────────────────────────────────────────────────────"],
      ["1. Each colored tab represents a data category (Income, Expenses, etc.)"],
      ["2. Row 1 on each data sheet is the header — do not modify or delete it"],
      ["3. The ID column (column A) links rows to existing database records"],
      ["4. To EDIT an entry: change values in its row, keep the ID intact"],
      ["5. To ADD a new entry: add a row at the bottom, leave the ID column blank"],
      ["6. To DELETE an entry: clear the entire row or delete it"],
      ["7. Save the file and import it back through the Budget Tracker app"],
      [""],
      ["COLUMN FORMATS"],
      ["─────────────────────────────────────────────────────"],
      ["Dates        YYYY-MM-DD  (e.g., 2026-03-15)"],
      ["Amounts      Numbers only, no currency symbols (e.g., 1500.00)"],
      ["Intervals    ONE_TIME, DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, or YEARLY"],
      ["Active       TRUE or FALSE"],
      ["Is Variable  TRUE or FALSE (variable expenses can have Price Adjustments)"],
      [""],
      ["ADDING CATEGORIES"],
      ["─────────────────────────────────────────────────────"],
      ["Categories help organize your expenses. To add a new category:"],
      ["  • On the Expenses sheet, type any category name in the Category column"],
      ["  • Optionally, add a matching row on the Category Colors sheet"],
      ["    with the same name and a hex color code (e.g., #3498DB)"],
      ["  • On import, new categories are created automatically"],
      [""],
      ["PRICE ADJUSTMENTS"],
      ["─────────────────────────────────────────────────────"],
      ["Price adjustments track cost changes for variable expenses over time."],
      ["  • The Expense Name column must exactly match an expense marked Is Variable = TRUE"],
      ["  • Each adjustment has a start date — the new price applies from that date forward"],
      ["  • Leave the ID blank for new adjustments, keep it for existing ones"],
      [""],
      ["ACTUAL SPENDING"],
      ["─────────────────────────────────────────────────────"],
      ["The Actual Spending sheet records real transactions you have made."],
      ["  • Each entry has a date, amount, optional note, and optional category"],
      ["  • Link an actual to a forecast expense by entering the expense name in the Linked Forecast column"],
      ["  • When linked, the projection uses the actual amount instead of the forecast on that date"],
      ["  • Leave the Linked Forecast column blank for unlinked (additional) spending"],
      [""],
      ["TIPS"],
      ["─────────────────────────────────────────────────────"],
      ["  • You can sort and filter data within each sheet — the import reads all rows"],
      ["  • Formatting (colors, borders) is cosmetic — only values matter on import"],
      ["  • Back up this file before making large changes"],
      [`  • Exported on: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`],
    ];

    instructions.forEach((line, i) => {
      const row = instrSheet.getRow(i + 1);
      const cell = row.getCell(1);
      cell.value = line[0];

      if (i === 0) {
        cell.font = { bold: true, size: 18, color: { argb: COLORS.darkBlue }, name: "Calibri" };
        row.height = 32;
      } else if (line[0]?.startsWith("HOW IT WORKS") || line[0]?.startsWith("COLUMN FORMATS") ||
                 line[0]?.startsWith("ADDING CATEGORIES") || line[0]?.startsWith("PRICE ADJUSTMENTS") ||
                 line[0]?.startsWith("ACTUAL SPENDING") || line[0]?.startsWith("TIPS")) {
        cell.font = { bold: true, size: 13, color: { argb: COLORS.medBlue }, name: "Calibri" };
        row.height = 24;
      } else if (line[0]?.startsWith("─")) {
        cell.font = { size: 10, color: { argb: COLORS.gray }, name: "Calibri" };
      } else {
        cell.font = { size: 11, color: { argb: COLORS.darkGray }, name: "Calibri" };
      }
    });

    // ═══ Balance Sheet ═══════════════════════════════════════════════════════

    const balSheet = wb.addWorksheet("Balance", {
      properties: { tabColor: { argb: COLORS.green } },
    });
    balSheet.columns = [
      { header: "Current Balance", key: "amount", width: 25 },
      { header: "As Of Date", key: "date", width: 20 },
    ];
    applyHeaderRow(balSheet, 1, COLORS.green);
    if (balanceSnap) {
      balSheet.addRow({ amount: balanceSnap.amount, date: toDateStr(balanceSnap.date) });
    } else {
      balSheet.addRow({ amount: 0, date: toDateStr(new Date()) });
    }
    formatAsCurrency(balSheet, 1, 2, 2);
    applyDataRows(balSheet, 2, 2);
    balSheet.getCell("A2").font = { bold: true, size: 14, color: { argb: COLORS.green }, name: "Calibri" };

    // ═══ Income Sheet ════════════════════════════════════════════════════════

    const incSheet = wb.addWorksheet("Income Sources", {
      properties: { tabColor: { argb: COLORS.green } },
    });
    incSheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Name", key: "name", width: 30 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Interval", key: "interval", width: 15 },
      { header: "Start Date", key: "startDate", width: 15 },
      { header: "Active", key: "active", width: 10 },
    ];
    applyHeaderRow(incSheet, 1, COLORS.green);

    incomes.forEach((inc: IncomeSource) => {
      incSheet.addRow({
        id: inc.id,
        name: inc.name,
        amount: inc.amount,
        interval: inc.interval,
        startDate: toDateStr(inc.startDate),
        active: inc.active ? "TRUE" : "FALSE",
      });
    });

    // Add 20 blank rows for new entries
    const incDataEnd = incSheet.rowCount;
    const incBlankEnd = incDataEnd + 20;
    applyDataRows(incSheet, 2, incBlankEnd, COLORS.lightGreen);
    styleIdColumn(incSheet, 1, 2, incBlankEnd);
    formatAsCurrency(incSheet, 3, 2, incBlankEnd);
    addIntervalValidation(incSheet, "D", 2, incBlankEnd);
    addBoolValidation(incSheet, "F", 2, incBlankEnd);

    // ═══ Expenses Sheet ══════════════════════════════════════════════════════

    const expSheet = wb.addWorksheet("Planned Expenses", {
      properties: { tabColor: { argb: COLORS.red } },
    });
    expSheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Name", key: "name", width: 30 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Interval", key: "interval", width: 15 },
      { header: "Start Date", key: "startDate", width: 15 },
      { header: "End Date", key: "endDate", width: 15 },
      { header: "Active", key: "active", width: 10 },
      { header: "Category", key: "category", width: 18 },
      { header: "Is Variable", key: "isVariable", width: 12 },
      { header: "Is Transfer", key: "isTransfer", width: 12 },
      { header: "Transfer To Account", key: "transferToAccount", width: 22 },
    ];
    applyHeaderRow(expSheet, 1, COLORS.red);

    expenses.forEach((exp: PlannedExpense & { priceAdjustments: PriceAdjustment[] }) => {
      expSheet.addRow({
        id: exp.id,
        name: exp.name,
        amount: exp.amount,
        interval: exp.interval,
        startDate: toDateStr(exp.startDate),
        endDate: exp.endDate ? toDateStr(exp.endDate) : "",
        active: exp.active ? "TRUE" : "FALSE",
        category: exp.category || "",
        isVariable: exp.isVariable ? "TRUE" : "FALSE",
        isTransfer: exp.isTransfer ? "TRUE" : "FALSE",
        transferToAccount: exp.transferToAccountId
          ? accountNameById.get(exp.transferToAccountId) || ""
          : "",
      });
    });

    const expDataEnd = expSheet.rowCount;
    const expBlankEnd = expDataEnd + 20;
    applyDataRows(expSheet, 2, expBlankEnd, COLORS.lightRed);
    styleIdColumn(expSheet, 1, 2, expBlankEnd);
    formatAsCurrency(expSheet, 3, 2, expBlankEnd);
    addIntervalValidation(expSheet, "D", 2, expBlankEnd);
    addBoolValidation(expSheet, "G", 2, expBlankEnd);
    addBoolValidation(expSheet, "I", 2, expBlankEnd);
    addBoolValidation(expSheet, "J", 2, expBlankEnd);

    // ═══ Price Adjustments Sheet ═════════════════════════════════════════════

    const priceSheet = wb.addWorksheet("Price Adjustments", {
      properties: { tabColor: { argb: COLORS.orange } },
    });
    priceSheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Expense Name", key: "expenseName", width: 30 },
      { header: "Expense ID", key: "expenseId", width: 10 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Start Date", key: "startDate", width: 15 },
      { header: "Note", key: "note", width: 35 },
    ];
    applyHeaderRow(priceSheet, 1, COLORS.orange);

    expenses.forEach((exp: PlannedExpense & { priceAdjustments: PriceAdjustment[] }) => {
      exp.priceAdjustments.forEach((pa: PriceAdjustment) => {
        priceSheet.addRow({
          id: pa.id,
          expenseName: exp.name,
          expenseId: exp.id,
          amount: pa.amount,
          startDate: toDateStr(pa.startDate),
          note: pa.note || "",
        });
      });
    });

    const priceDataEnd = priceSheet.rowCount;
    const priceBlankEnd = priceDataEnd + 15;
    applyDataRows(priceSheet, 2, priceBlankEnd, COLORS.lightOrange);
    styleIdColumn(priceSheet, 1, 2, priceBlankEnd);
    styleIdColumn(priceSheet, 3, 2, priceBlankEnd);
    formatAsCurrency(priceSheet, 4, 2, priceBlankEnd);

    // ═══ Actual Spending Sheet ═══════════════════════════════════════════════

    const actSheet = wb.addWorksheet("Actual Spending", {
      properties: { tabColor: { argb: COLORS.orange } },
    });
    actSheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Date", key: "date", width: 15 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Note", key: "note", width: 30 },
      { header: "Category", key: "category", width: 18 },
      { header: "Linked Forecast", key: "forecastName", width: 25 },
      { header: "Forecast ID", key: "forecastId", width: 10 },
    ];
    applyHeaderRow(actSheet, 1, COLORS.orange);

    actualSpends.forEach((a: { id: string; date: Date; amount: number; note: string | null; category: string | null; forecastExpenseId: string | null; forecastExpense: { id: string; name: string } | null }) => {
      actSheet.addRow({
        id: a.id,
        date: toDateStr(a.date),
        amount: a.amount,
        note: a.note || "",
        category: a.category || "",
        forecastName: a.forecastExpense?.name || "",
        forecastId: a.forecastExpenseId || "",
      });
    });

    const actDataEnd = actSheet.rowCount;
    const actBlankEnd = actDataEnd + 20;
    applyDataRows(actSheet, 2, actBlankEnd, COLORS.lightOrange);
    styleIdColumn(actSheet, 1, 2, actBlankEnd);
    styleIdColumn(actSheet, 7, 2, actBlankEnd);
    formatAsCurrency(actSheet, 3, 2, actBlankEnd);

    // ═══ Category Colors Sheet ═══════════════════════════════════════════════

    const catSheet = wb.addWorksheet("Category Colors", {
      properties: { tabColor: { argb: COLORS.purple } },
    });
    catSheet.columns = [
      { header: "Category Name", key: "name", width: 25 },
      { header: "Color (hex)", key: "color", width: 18 },
      { header: "Description", key: "description", width: 35 },
      { header: "Preview", key: "preview", width: 12 },
    ];
    applyHeaderRow(catSheet, 1, COLORS.purple);

    categoryColors.forEach((cat: { name: string; color: string; description: string }) => {
      const rowNum = catSheet.rowCount + 1;
      catSheet.addRow({ name: cat.name, color: cat.color, description: cat.description || "", preview: "" });
      // Color preview cell
      const hex = cat.color.replace("#", "");
      catSheet.getCell(rowNum, 4).fill = headerFill(hex);
    });

    const catDataEnd = catSheet.rowCount;
    const catBlankEnd = catDataEnd + 10;
    applyDataRows(catSheet, 2, catBlankEnd, COLORS.lightPurple);

    // ═══ Freeze panes & auto-filter ═════════════════════════════════════════

    [incSheet, expSheet, priceSheet, actSheet, catSheet].forEach((sheet) => {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      if (sheet.rowCount > 1) {
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: sheet.columnCount },
        };
      }
    });

    // ═══ Send response ══════════════════════════════════════════════════════

    const safeName = account.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `budget-tracker-${safeName}-${toDateStr(new Date())}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Failed to export spreadsheet" });
  }
});

// ─── IMPORT ──────────────────────────────────────────────────────────────────

router.post("/import", upload.single("file"), async (req: Request<{ accountId: string }>, res) => {
  try {
    const { accountId } = req.params;
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as unknown as ArrayBuffer);

    const incomeSheet = wb.getWorksheet("Income Sources");
    const expenseSheet = wb.getWorksheet("Planned Expenses");
    validateWorkbook(wb);

    const results = {
      balance: { updated: false },
      income: { created: 0, updated: 0, deleted: 0 },
      expenses: { created: 0, updated: 0, deleted: 0 },
      priceAdjustments: { created: 0, updated: 0, deleted: 0 },
      actualSpends: { created: 0, updated: 0, deleted: 0 },
      categories: { created: 0, updated: 0 },
      errors: [] as string[],
    };

    await prisma.$transaction(async (tx) => {
      const db = tx;

      if (results.errors.length > 0) {
        throw new SpreadsheetValidationError(results.errors.join("; "));
      }

    // ═══ Balance ═════════════════════════════════════════════════════════════

    const balSheet = wb.getWorksheet("Balance");
    if (balSheet) {
      const row = balSheet.getRow(2);
      const amount = Number(row.getCell(1).value);
      const balDate = parseDate(row.getCell(2).value);
      if (!isNaN(amount)) {
        await db.balanceSnapshot.create({
          data: { amount, date: balDate ? new Date(balDate) : new Date(), accountId },
        });
        results.balance.updated = true;
      }
    }

    // ═══ Income Sources ══════════════════════════════════════════════════════

    const incSheet = incomeSheet;
    if (incSheet) {
      const existingIds = new Set(
        (await db.incomeSource.findMany({ where: { accountId }, select: { id: true } })).map((i) => i.id)
      );
      const seenIds = new Set<string>();
      const incomeOps: Promise<void>[] = [];

      incSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;

        const name = String(row.getCell(2).value || "").trim();
        if (!name) return;

        const id = String(row.getCell(1).value || "").trim();
        const amount = Number(row.getCell(3).value);
        const interval = String(row.getCell(4).value || "").trim().toUpperCase() as Interval;
        const startDate = parseDate(row.getCell(5).value);
        const active = parseBool(row.getCell(6).value);

        const data = { name, amount, interval, startDate: new Date(startDate!), active, accountId };

        if (id && existingIds.has(id)) {
          seenIds.add(id);
          incomeOps.push(
            db.incomeSource.update({ where: { id }, data }).then(() => { results.income.updated++; })
          );
        } else {
          incomeOps.push(
            db.incomeSource.create({ data }).then(() => { results.income.created++; })
          );
        }
      });

      await Promise.all(incomeOps);

      const incToArchive = [...existingIds].filter((id) => !seenIds.has(id));
      if (incToArchive.length > 0) {
        await archiveIncomeSources(db, incToArchive, accountId);
        results.income.deleted = incToArchive.length;
      }
    }

    // ═══ Planned Expenses ════════════════════════════════════════════════════

    const expSheet = expenseSheet;
    if (expSheet) {
      const existingIds = new Set(
        (await db.plannedExpense.findMany({ where: { accountId }, select: { id: true } })).map((e) => e.id)
      );
      const seenIds = new Set<string>();
      const expenseOps: Promise<void>[] = [];

      // First pass: find transfer target accounts that need to be created
      const neededAccounts = new Set<string>();
      let importAccounts = await db.account.findMany({ select: { id: true, name: true } });
      let accountIdByName = new Map(importAccounts.map((a) => [a.name.toLowerCase(), a.id]));

      expSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const isTransfer = parseBool(row.getCell(10).value);
        const transferToAccountName = String(row.getCell(11).value || "").trim();
        if (isTransfer && transferToAccountName && !accountIdByName.has(transferToAccountName.toLowerCase())) {
          neededAccounts.add(transferToAccountName);
        }
      });

      // Auto-create missing transfer target accounts
      for (const acctName of neededAccounts) {
        await db.account.create({ data: { name: acctName } });
        results.errors.push(`Auto-created account "${acctName}" for transfer target`);
      }

      // Refresh account lookup if we created any
      if (neededAccounts.size > 0) {
        importAccounts = await db.account.findMany({ select: { id: true, name: true } });
        accountIdByName = new Map(importAccounts.map((a) => [a.name.toLowerCase(), a.id]));
      }

      // Second pass: process expense rows
      expSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;

        const name = String(row.getCell(2).value || "").trim();
        if (!name) return;

        const id = String(row.getCell(1).value || "").trim();
        const amount = Number(row.getCell(3).value);
        const interval = String(row.getCell(4).value || "").trim().toUpperCase() as Interval;
        const startDate = parseDate(row.getCell(5).value);
        const endDate = parseDate(row.getCell(6).value);
        const active = parseBool(row.getCell(7).value);
        const category = String(row.getCell(8).value || "").trim() || null;
        const isVariable = parseBool(row.getCell(9).value);
        const isTransfer = parseBool(row.getCell(10).value);
        const transferToAccountName = String(row.getCell(11).value || "").trim();

        let transferToAccountId: string | null = null;
        if (isTransfer && transferToAccountName) {
          const resolved = accountIdByName.get(transferToAccountName.toLowerCase());
          if (resolved) {
            transferToAccountId = resolved;
          } else {
            results.errors.push(`Expense row ${rowNum}: transfer target "${transferToAccountName}" not found`);
          }
        }

        const data = {
          name,
          amount,
          interval,
          startDate: new Date(startDate!),
          endDate: endDate ? new Date(endDate) : null,
          active,
          category,
          isVariable,
          isTransfer: isTransfer && transferToAccountId !== null,
          transferToAccountId,
          accountId,
        };

        if (id && existingIds.has(id)) {
          seenIds.add(id);
          expenseOps.push(
            db.plannedExpense.update({ where: { id }, data }).then(() => { results.expenses.updated++; })
          );
        } else {
          expenseOps.push(
            db.plannedExpense.create({ data }).then(() => { results.expenses.created++; })
          );
        }
      });

      await Promise.all(expenseOps);

      const expToArchive = [...existingIds].filter((id) => !seenIds.has(id));
      if (expToArchive.length > 0) {
        await archivePlannedExpenses(db, expToArchive, accountId);
        results.expenses.deleted = expToArchive.length;
      }
    }

    // ═══ Price Adjustments ═══════════════════════════════════════════════════

    const priceSheet = wb.getWorksheet("Price Adjustments");
    if (priceSheet) {
      // Build a name→id lookup from the current expenses
      const allExpenses = await db.plannedExpense.findMany({
        where: { accountId },
        select: { id: true, name: true },
      });
      const nameToId = new Map(allExpenses.map((e) => [e.name.toLowerCase(), e.id]));
      const accountExpenseIds = new Set(allExpenses.map((e) => e.id));

      const existingPaIds = new Set(
        (await db.priceAdjustment.findMany({
          where: { expenseId: { in: [...accountExpenseIds] } },
          select: { id: true },
        })).map((p) => p.id)
      );
      const seenPaIds = new Set<string>();
      const paOps: Promise<void>[] = [];

      priceSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;

        const expenseName = String(row.getCell(2).value || "").trim();
        if (!expenseName) return;

        const id = String(row.getCell(1).value || "").trim();
        let expenseId = String(row.getCell(3).value || "").trim();
        const amount = Number(row.getCell(4).value);
        const startDate = parseDate(row.getCell(5).value);
        const note = String(row.getCell(6).value || "").trim() || null;

        // Resolve expense ID from name if not provided
        if (!expenseId) {
          expenseId = nameToId.get(expenseName.toLowerCase()) || "";
        }

        const data = {
          expenseId,
          amount,
          startDate: new Date(startDate!),
          note,
        };

        if (id && existingPaIds.has(id)) {
          seenPaIds.add(id);
          paOps.push(
            db.priceAdjustment.update({ where: { id }, data }).then(() => { results.priceAdjustments.updated++; })
          );
        } else {
          paOps.push(
            db.priceAdjustment.create({ data }).then(() => { results.priceAdjustments.created++; })
          );
        }
      });

      const paToDelete = [...existingPaIds].filter((id) => !seenPaIds.has(id));
      if (paToDelete.length > 0) {
        await db.priceAdjustment.deleteMany({ where: { id: { in: paToDelete } } });
        results.priceAdjustments.deleted = paToDelete.length;
      }

      await Promise.all(paOps);
    }

    // ═══ Actual Spending ═════════════════════════════════════════════════════

    const actSheetImport = wb.getWorksheet("Actual Spending");
    if (actSheetImport) {
      const existingActIds = new Set(
        (await db.actualSpend.findMany({ where: { accountId }, select: { id: true } })).map((a) => a.id)
      );
      const seenActIds = new Set<string>();
      const actOps: Promise<void>[] = [];

      // Build expense name→id lookup for linking
      const expensesForLookup = await db.plannedExpense.findMany({
        where: { accountId },
        select: { id: true, name: true },
      });
      const expenseIdByName = new Map(expensesForLookup.map((e) => [e.name.toLowerCase(), e.id]));
      const validExpenseIds = new Set(expensesForLookup.map((e) => e.id));

      actSheetImport.eachRow((row, rowNum) => {
        if (rowNum === 1) return;

        const date = parseDate(row.getCell(2).value);
        const amount = Number(row.getCell(3).value);

        const id = String(row.getCell(1).value || "").trim();
        const note = String(row.getCell(4).value || "").trim() || null;
        const category = String(row.getCell(5).value || "").trim() || null;
        const forecastName = String(row.getCell(6).value || "").trim();
        let forecastExpenseId = String(row.getCell(7).value || "").trim() || null;

        // Validate/resolve forecast link
        if (forecastExpenseId && !validExpenseIds.has(forecastExpenseId)) {
          // ID from spreadsheet doesn't exist — try resolving by name
          forecastExpenseId = forecastName ? expenseIdByName.get(forecastName.toLowerCase()) || null : null;
          if (!forecastExpenseId) {
            results.errors.push(`Actual row ${rowNum}: linked forecast no longer exists, importing as unlinked`);
          }
        } else if (!forecastExpenseId && forecastName) {
          forecastExpenseId = expenseIdByName.get(forecastName.toLowerCase()) || null;
          if (!forecastExpenseId) {
            results.errors.push(`Actual row ${rowNum}: forecast "${forecastName}" not found, importing as unlinked`);
          }
        }

        const data = {
          date: new Date(date!),
          amount,
          note,
          category,
          forecastExpenseId,
          accountId,
        };

        if (id && existingActIds.has(id)) {
          seenActIds.add(id);
          actOps.push(
            db.actualSpend.update({ where: { id }, data }).then(() => { results.actualSpends.updated++; })
          );
        } else {
          actOps.push(
            db.actualSpend.create({ data }).then(() => { results.actualSpends.created++; })
          );
        }
      });

      const actToDelete = [...existingActIds].filter((id) => !seenActIds.has(id));
      if (actToDelete.length > 0) {
        await db.actualSpend.deleteMany({ where: { id: { in: actToDelete }, accountId } });
        results.actualSpends.deleted = actToDelete.length;
      }

      await Promise.all(actOps);
    }

    // ═══ Category Colors ═════════════════════════════════════════════════════

    const catSheet = wb.getWorksheet("Category Colors");
    if (catSheet) {
      catSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const name = String(row.getCell(1).value || "").trim();
        if (!name) return;
        let color = String(row.getCell(2).value || "").trim();
        if (!color) color = "#ef4444";
        if (!color.startsWith("#")) color = "#" + color;
      });

      const catOps: Promise<void>[] = [];
      catSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const name = String(row.getCell(1).value || "").trim();
        if (!name) return;
        let color = String(row.getCell(2).value || "").trim();
        if (!color) color = "#ef4444";
        if (!color.startsWith("#")) color = "#" + color;
        const description = String(row.getCell(3).value || "").trim();

        catOps.push(
          db.categoryColor.upsert({
            where: { name },
            create: { name, color, description },
            update: { color, description },
          }).then(() => { results.categories.updated++; })
        );
      });

      await Promise.all(catOps);
    }

    });

    res.json({
      message: "Import completed successfully",
      results,
    });
  } catch (err) {
    if (err instanceof SpreadsheetValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Import error:", err);
    res.status(500).json({ error: "Failed to import spreadsheet" });
  }
});

export default router;
