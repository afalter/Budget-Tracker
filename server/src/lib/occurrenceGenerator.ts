import type { Interval } from "@prisma/client";
import { getEffectiveAmount, getOccurrenceDate, occurrenceKey } from "./projectionEngine";
import { toDateKey, toUtcDate } from "./date";

export type OccurrenceRule = IncomeOccurrenceRule | ExpenseOccurrenceRule;

interface BaseOccurrenceRule {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  interval: Interval;
  startDate: Date;
  active: boolean;
}

export interface IncomeOccurrenceRule extends BaseOccurrenceRule {
  sourceType: "INCOME_SOURCE";
}

export interface ExpenseOccurrenceRule extends BaseOccurrenceRule {
  sourceType: "PLANNED_EXPENSE";
  endDate?: Date | null;
  category?: string | null;
  isVariable?: boolean;
  isTransfer?: boolean;
  priceAdjustments?: { amount: number; startDate: Date }[];
}

export interface CalculatedOccurrence {
  accountId: string;
  type: "INCOME" | "EXPENSE";
  incomeSourceId?: string;
  plannedExpenseId?: string;
  anchorDate: Date;
  dueDate: Date;
  plannedAmount: number;
  effectiveAmount: number;
  identityKey: string;
  nameSnapshot: string;
  categorySnapshot: string | null;
  originalRuleId: string;
}

/**
 * Calculate occurrences without persistence or booking side effects.
 *
 * Dates are UTC calendar days. The returned range is inclusive. Past dates
 * are intentionally returned when they fall in the requested range; this
 * service only calculates data and never creates transactions.
 */
export function calculateOccurrences(
  rule: OccurrenceRule,
  rangeStart: Date,
  rangeEnd: Date
): CalculatedOccurrence[] {
  validateRule(rule);
  const start = normalizeAndValidateDate(rangeStart, "rangeStart");
  const end = normalizeAndValidateDate(rangeEnd, "rangeEnd");
  if (end < start || !rule.active || (rule.sourceType === "PLANNED_EXPENSE" && rule.isTransfer)) {
    return [];
  }

  const anchorDate = normalizeAndValidateDate(rule.startDate, "startDate");
  const occurrences: CalculatedOccurrence[] = [];

  for (let occurrenceIndex = 0; ; occurrenceIndex++) {
    const dueDate = getOccurrenceDate(rule.interval, anchorDate, occurrenceIndex);
    if (dueDate > end) break;
    if (
      dueDate >= start &&
      !(rule.sourceType === "PLANNED_EXPENSE" &&
        rule.endDate &&
        dueDate > normalizeAndValidateDate(rule.endDate, "endDate"))
    ) {
      const plannedAmount = rule.amount;
      const effectiveAmount =
        rule.sourceType === "PLANNED_EXPENSE"
          ? getEffectiveAmount(
              {
                amount: rule.amount,
                isVariable: rule.isVariable ?? false,
                priceAdjustments: [...(rule.priceAdjustments ?? [])].sort(
                  (a, b) => normalizeAndValidateDate(a.startDate, "priceAdjustment.startDate").getTime() - normalizeAndValidateDate(b.startDate, "priceAdjustment.startDate").getTime()
                ),
              },
              dueDate
            )
          : plannedAmount;

      occurrences.push({
        accountId: rule.accountId,
        type: rule.sourceType === "INCOME_SOURCE" ? "INCOME" : "EXPENSE",
        ...(rule.sourceType === "INCOME_SOURCE"
          ? { incomeSourceId: rule.id }
          : { plannedExpenseId: rule.id }),
        anchorDate,
        dueDate,
        plannedAmount,
        effectiveAmount,
        identityKey: occurrenceKey(rule.sourceType, rule.id, dueDate),
        nameSnapshot: rule.name,
        categorySnapshot: rule.sourceType === "PLANNED_EXPENSE" ? rule.category ?? null : null,
        originalRuleId: rule.id,
      });
    }

    if (rule.interval === "ONE_TIME") break;
  }

  return occurrences;
}

function validateRule(rule: OccurrenceRule): void {
  if (!rule.id || !rule.accountId || !rule.name) {
    throw new Error("rule id, accountId, and name are required");
  }
  if (!Number.isFinite(rule.amount) || rule.amount < 0) {
    throw new Error("rule amount must be a non-negative finite number");
  }
  normalizeAndValidateDate(rule.startDate, "startDate");
  if (rule.sourceType === "PLANNED_EXPENSE" && rule.endDate) {
    normalizeAndValidateDate(rule.endDate, "endDate");
  }
}

function normalizeAndValidateDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return toUtcDate(value);
}

export function occurrenceDateKey(occurrence: CalculatedOccurrence): string {
  return toDateKey(occurrence.dueDate);
}
