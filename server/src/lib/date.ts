/**
 * Normalize a date to UTC midnight so recurring schedule calculations are
 * independent of the server's local timezone.
 */
export function toUtcDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/** Return the canonical YYYY-MM-DD representation of a date. */
export function toDateKey(date: Date): string {
  return toUtcDate(date).toISOString().split("T")[0];
}

/** Return the number of days in a UTC calendar month. */
export function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}