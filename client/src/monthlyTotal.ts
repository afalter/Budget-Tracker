import { Interval } from "./types";

/**
 * Count how many times an item with the given interval and startDate
 * fires within the current calendar month.
 */
function countOccurrencesThisMonth(
  interval: Interval,
  startDate: string,
  endDate?: string
): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // last day of month

  const start = new Date(startDate.split("T")[0] + "T00:00:00");
  const end = endDate ? new Date(endDate.split("T")[0] + "T00:00:00") : null;

  let count = 0;
  const current = new Date(monthStart);

  while (current <= monthEnd) {
    if (current >= start && (!end || current <= end)) {
      if (matchesInterval(interval, start, current)) {
        count++;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

function matchesInterval(interval: Interval, startDate: Date, checkDate: Date): boolean {
  if (checkDate < startDate) return false;

  const diffMs = checkDate.getTime() - startDate.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  switch (interval) {
    case Interval.ONE_TIME:
      return diffDays === 0;
    case Interval.DAILY:
      return true;
    case Interval.WEEKLY:
      return diffDays % 7 === 0;
    case Interval.BIWEEKLY:
      return diffDays % 14 === 0;
    case Interval.MONTHLY:
      return matchesMonthInterval(startDate, checkDate, 1);
    case Interval.BIMONTHLY:
      return matchesMonthInterval(startDate, checkDate, 2);
    case Interval.QUARTERLY:
      if (checkDate.getDate() !== startDate.getDate()) return false;
      const monthDiff =
        (checkDate.getFullYear() - startDate.getFullYear()) * 12 +
        (checkDate.getMonth() - startDate.getMonth());
      return monthDiff >= 0 && monthDiff % 3 === 0;
    case Interval.YEARLY:
      return (
        checkDate.getMonth() === startDate.getMonth() &&
        checkDate.getDate() === startDate.getDate()
      );
    default:
      return false;
  }
}

function matchesMonthInterval(startDate: Date, checkDate: Date, monthStep: number): boolean {
  const monthDiff =
    (checkDate.getFullYear() - startDate.getFullYear()) * 12 +
    checkDate.getMonth() -
    startDate.getMonth();
  if (monthDiff < 0 || monthDiff % monthStep !== 0) return false;

  const target = new Date(startDate.getFullYear(), startDate.getMonth() + monthDiff, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const targetDay = Math.min(startDate.getDate(), lastDay);
  return checkDate.getFullYear() === target.getFullYear() &&
    checkDate.getMonth() === target.getMonth() &&
    checkDate.getDate() === targetDay;
}

/**
 * Calculate the total amount that active items contribute to the current month.
 */
export function calcMonthlyTotal(
  items: { amount: number; interval: Interval; startDate: string; endDate?: string; active: boolean }[]
): number {
  let total = 0;
  for (const item of items) {
    if (!item.active) continue;
    const occurrences = countOccurrencesThisMonth(item.interval, item.startDate, item.endDate);
    total += item.amount * occurrences;
  }
  return Math.round(total * 100) / 100;
}
