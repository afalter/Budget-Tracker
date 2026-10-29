import type { Interval } from "@prisma/client";
import { daysInUtcMonth, toDateKey, toUtcDate } from "./date";

/**
 * Calculate the concrete date for a zero-based occurrence index.
 *
 * Monthly and yearly calculations always use the original start date as the
 * anchor. This means a January 31 monthly rule produces February 28 and then
 * March 31, rather than drifting to the 28th after the first clamp.
 */
export function getOccurrenceDate(
  interval: Interval,
  startDate: Date,
  occurrenceIndex: number
): Date {
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) {
    throw new Error("occurrenceIndex must be a non-negative integer");
  }

  const start = toUtcDate(startDate);
  if (Number.isNaN(start.getTime())) {
    throw new Error("startDate must be a valid date");
  }
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();

  switch (interval) {
    case "ONE_TIME":
      if (occurrenceIndex !== 0) {
        throw new Error("ONE_TIME has only one occurrence");
      }
      return start;
    case "DAILY":
      return addUtcDays(start, occurrenceIndex);
    case "WEEKLY":
      return addUtcDays(start, occurrenceIndex * 7);
    case "BIWEEKLY":
      return addUtcDays(start, occurrenceIndex * 14);
    case "MONTHLY":
      return clampedMonthDate(year, month + occurrenceIndex, day);
    case "QUARTERLY":
      return clampedMonthDate(year, month + occurrenceIndex * 3, day);
    case "YEARLY": {
      const targetYear = year + occurrenceIndex;
      const targetDay = month === 1 && day === 29
        ? Math.min(day, daysInUtcMonth(targetYear, month))
        : day;
      return new Date(Date.UTC(targetYear, month, targetDay));
    }
    default:
      throw new Error(`Unsupported interval: ${interval}`);
  }
}

function addUtcDays(start: Date, days: number): Date {
  const result = new Date(start);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function clampedMonthDate(year: number, month: number, anchorDay: number): Date {
  const target = new Date(Date.UTC(year, month, 1));
  const targetDay = Math.min(
    anchorDay,
    daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth())
  );
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), targetDay));
}

export function matchesInterval(
  interval: Interval,
  startDate: Date,
  checkDate: Date
): boolean {
  const start = toUtcDate(startDate);
  const check = toUtcDate(checkDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(check.getTime())) {
    return false;
  }

  if (check < start) return false;

  const diffMs = check.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  switch (interval) {
    case "ONE_TIME":
      return diffDays === 0;
    case "DAILY":
      return true;
    case "WEEKLY":
      return diffDays % 7 === 0;
    case "BIWEEKLY":
      return diffDays % 14 === 0;
    case "MONTHLY": {
      const monthDiff = monthsBetween(start, check);
      return getOccurrenceDate(interval, start, monthDiff).getTime() === check.getTime();
    }
    case "QUARTERLY": {
      const monthDiff = monthsBetween(start, check);
      return monthDiff % 3 === 0 &&
        getOccurrenceDate(interval, start, monthDiff / 3).getTime() === check.getTime();
    }
    case "YEARLY": {
      const yearDiff = check.getUTCFullYear() - start.getUTCFullYear();
      return getOccurrenceDate(interval, start, yearDiff).getTime() === check.getTime();
    }
    default:
      return false;
  }
}

function monthsBetween(start: Date, check: Date): number {
  return (
    (check.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    check.getUTCMonth() -
    start.getUTCMonth()
  );
}

export interface VariableAmountItem {
  amount: number;
  isVariable: boolean;
  priceAdjustments: { amount: number; startDate: Date }[];
}

export function getEffectiveAmount(
  item: VariableAmountItem,
  currentDate: Date
): number {
  if (!item.isVariable || item.priceAdjustments.length === 0) {
    return item.amount;
  }

  let effectiveAmount = item.amount;
  const checkDate = toUtcDate(currentDate);
  for (const adj of item.priceAdjustments) {
    const adjDate = toUtcDate(adj.startDate);
    if (adjDate <= checkDate) {
      effectiveAmount = adj.amount;
    } else {
      break;
    }
  }
  return effectiveAmount;
}

/**
 * Build a stable identifier for one occurrence of one recurring rule.
 * The date is normalized before formatting so timezone offsets cannot change
 * the identity of an occurrence.
 */
export function occurrenceKey(
  sourceType: "INCOME_SOURCE" | "PLANNED_EXPENSE",
  sourceId: string,
  scheduledDate: Date
): string {
  return `${sourceType}:${sourceId}:${toDateKey(scheduledDate)}`;
}