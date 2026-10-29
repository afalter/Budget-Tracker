import { describe, expect, it } from "vitest";
import { calculateOccurrences, type ExpenseOccurrenceRule, type IncomeOccurrenceRule } from "./occurrenceGenerator";
import { matchesInterval } from "./projectionEngine";

const date = (value: string) =>
  value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);

function income(interval: IncomeOccurrenceRule["interval"], startDate: string): IncomeOccurrenceRule {
  return {
    id: "income-1",
    accountId: "account-1",
    sourceType: "INCOME_SOURCE",
    name: "Salary",
    amount: 100,
    interval,
    startDate: date(startDate),
    active: true,
  };
}

function expense(overrides: Partial<ExpenseOccurrenceRule> = {}): ExpenseOccurrenceRule {
  return {
    id: "expense-1",
    accountId: "account-1",
    sourceType: "PLANNED_EXPENSE",
    name: "Rent",
    amount: 100,
    interval: "MONTHLY",
    startDate: date("2026-01-31"),
    active: true,
    category: "Housing",
    ...overrides,
  };
}

describe("calculateOccurrences", () => {
  it.each([
    ["ONE_TIME", "2026-01-01", ["2026-01-01"]],
    ["DAILY", "2026-01-03", ["2026-01-01", "2026-01-02", "2026-01-03"]],
    ["WEEKLY", "2026-01-15", ["2026-01-01", "2026-01-08", "2026-01-15"]],
    ["BIWEEKLY", "2026-01-29", ["2026-01-01", "2026-01-15", "2026-01-29"]],
    ["MONTHLY", "2026-03-01", ["2026-01-01", "2026-02-01", "2026-03-01"]],
    ["QUARTERLY", "2026-07-01", ["2026-01-01", "2026-04-01", "2026-07-01"]],
    ["YEARLY", "2027-01-01", ["2026-01-01", "2027-01-01"]],
  ] as const)("supports %s", (interval, _lastDate, expected) => {
    const occurrences = calculateOccurrences(
      income(interval, "2026-01-01"),
      date("2026-01-01"),
      date(_lastDate)
    );
    expect(occurrences.map((item) => item.dueDate.toISOString().slice(0, 10))).toEqual(expected);
  });

  it.each([28, 29, 30, 31])("keeps the monthly anchor day %s without drift", (day) => {
    const occurrences = calculateOccurrences(
      expense({ startDate: date(`2026-01-${day}`) }),
      date("2026-01-01"),
      date("2026-03-31")
    );
    expect(occurrences.map((item) => item.dueDate.toISOString().slice(0, 10))).toEqual([
      `2026-01-${String(day).padStart(2, "0")}`,
      "2026-02-28",
      `2026-03-${String(day).padStart(2, "0")}`,
    ]);
  });

  it("handles quarterly year changes using the original anchor", () => {
    const occurrences = calculateOccurrences(
      expense({ interval: "QUARTERLY", startDate: date("2026-10-31") }),
      date("2026-10-01"),
      date("2027-10-31")
    );
    expect(occurrences.map((item) => item.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-10-31",
      "2027-01-31",
      "2027-04-30",
      "2027-07-31",
      "2027-10-31",
    ]);
  });

  it("clamps February 29 yearly occurrences in non-leap years", () => {
    const occurrences = calculateOccurrences(
      income("YEARLY", "2024-02-29"),
      date("2024-02-29"),
      date("2028-02-29")
    );
    expect(occurrences.map((item) => item.dueDate.toISOString().slice(0, 10))).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("normalizes range and rule dates to UTC calendar days", () => {
    const occurrences = calculateOccurrences(
      income("ONE_TIME", "2026-03-02T01:00:00.000Z"),
      new Date("2026-03-01T23:00:00-05:00"),
      new Date("2026-03-02T23:00:00-05:00")
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].dueDate).toEqual(date("2026-03-02"));
  });

  it("treats expense endDate as inclusive", () => {
    const occurrences = calculateOccurrences(
      expense({ endDate: date("2026-03-31") }),
      date("2026-03-31"),
      date("2026-04-30")
    );
    expect(occurrences.map((item) => item.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-03-31",
    ]);
  });

  it("returns no occurrences for inactive rules or transfers", () => {
    expect(calculateOccurrences(expense({ active: false }), date("2026-01-01"), date("2026-03-31"))).toEqual([]);
    expect(calculateOccurrences(expense({ isTransfer: true }), date("2026-01-01"), date("2026-03-31"))).toEqual([]);
  });

  it("returns past occurrences as data but does not book anything", () => {
    const occurrences = calculateOccurrences(
      income("DAILY", "2026-01-01"),
      date("2026-01-01"),
      date("2026-01-03")
    );
    expect(occurrences).toHaveLength(3);
  });

  it("produces stable unique keys and no duplicate dates", () => {
    const rule = expense({ interval: "DAILY", startDate: date("2026-01-01") });
    const first = calculateOccurrences(rule, date("2026-01-01"), date("2026-01-03"));
    const second = calculateOccurrences(rule, date("2026-01-01"), date("2026-01-03"));
    expect(first.map((item) => item.identityKey)).toEqual(second.map((item) => item.identityKey));
    expect(new Set(first.map((item) => item.identityKey)).size).toBe(first.length);
  });

  it("uses the same occurrence dates as forecast matching", () => {
    const rules = [
      income("DAILY", "2026-01-01"),
      income("WEEKLY", "2026-01-01"),
      income("BIWEEKLY", "2026-01-01"),
      income("MONTHLY", "2026-01-31"),
      income("QUARTERLY", "2026-10-31"),
      income("YEARLY", "2024-02-29"),
    ];

    for (const rule of rules) {
      const occurrences = calculateOccurrences(rule, date("2026-01-01"), date("2028-12-31"));
      for (const occurrence of occurrences) {
        expect(matchesInterval(rule.interval, rule.startDate, occurrence.dueDate)).toBe(true);
      }
    }
  });

  it("returns snapshot and relationship data", () => {
    const [occurrence] = calculateOccurrences(expense(), date("2026-01-31"), date("2026-01-31"));
    expect(occurrence).toMatchObject({
      accountId: "account-1",
      type: "EXPENSE",
      plannedExpenseId: "expense-1",
      plannedAmount: 100,
      effectiveAmount: 100,
      nameSnapshot: "Rent",
      categorySnapshot: "Housing",
      originalRuleId: "expense-1",
    });
  });
});
