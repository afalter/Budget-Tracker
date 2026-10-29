import { describe, expect, it } from "vitest";
import {
  getEffectiveAmount,
  getOccurrenceDate,
  matchesInterval,
  occurrenceKey,
} from "./projectionEngine";

const Interval = {
  ONE_TIME: "ONE_TIME",
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
} as const;

const date = (value: string) => new Date(`${value}T00:00:00Z`);

describe("matchesInterval", () => {
  it("fires a one-time interval only on its start date", () => {
    const start = date("2026-03-15");

    expect(matchesInterval(Interval.ONE_TIME, start, date("2026-03-14"))).toBe(false);
    expect(matchesInterval(Interval.ONE_TIME, start, date("2026-03-15"))).toBe(true);
    expect(matchesInterval(Interval.ONE_TIME, start, date("2026-03-16"))).toBe(false);
  });

  it.each([
    [Interval.DAILY, "2026-03-16", true],
    [Interval.WEEKLY, "2026-03-22", true],
    [Interval.WEEKLY, "2026-03-23", false],
    [Interval.BIWEEKLY, "2026-03-29", true],
    [Interval.BIWEEKLY, "2026-04-05", false],
  ])("handles %s recurrence", (interval, checkDate, expected) => {
    expect(matchesInterval(interval, date("2026-03-15"), date(checkDate))).toBe(expected);
  });

  it("matches monthly occurrences by day of month", () => {
    const start = date("2026-01-15");

    expect(matchesInterval(Interval.MONTHLY, start, date("2026-02-15"))).toBe(true);
    expect(matchesInterval(Interval.MONTHLY, start, date("2026-02-14"))).toBe(false);
  });

  it.each([28, 29, 30, 31])("clamps monthly anchor %s consistently", (day) => {
    const start = date(`2026-01-${day}`);

    expect(matchesInterval(Interval.MONTHLY, start, date("2026-02-28"))).toBe(true);
    expect(matchesInterval(Interval.MONTHLY, start, date(`2026-03-${day}`))).toBe(true);
  });

  it("handles quarterly and yearly date boundaries", () => {
    const quarterlyStart = date("2026-01-10");
    expect(matchesInterval(Interval.QUARTERLY, quarterlyStart, date("2026-04-10"))).toBe(true);
    expect(matchesInterval(Interval.QUARTERLY, quarterlyStart, date("2026-05-10"))).toBe(false);

    const yearlyStart = date("2026-03-15");
    expect(matchesInterval(Interval.YEARLY, yearlyStart, date("2027-03-15"))).toBe(true);
    expect(matchesInterval(Interval.YEARLY, yearlyStart, date("2027-03-16"))).toBe(false);
  });

  it("matches February 29 yearly anchors on February 28 in non-leap years", () => {
    const start = date("2024-02-29");

    expect(matchesInterval(Interval.YEARLY, start, date("2025-02-28"))).toBe(true);
    expect(matchesInterval(Interval.YEARLY, start, date("2026-02-28"))).toBe(true);
    expect(matchesInterval(Interval.YEARLY, start, date("2028-02-29"))).toBe(true);
  });

  it("normalizes timezone offsets to the UTC calendar date", () => {
    expect(
      matchesInterval(
        Interval.ONE_TIME,
        new Date("2026-03-15T23:00:00-05:00"),
        date("2026-03-16")
      )
    ).toBe(true);
  });
});

describe("getOccurrenceDate", () => {
  it.each([
    ["2026-01-28", "2026-02-28"],
    ["2026-01-29", "2026-02-28"],
    ["2026-01-30", "2026-02-28"],
    ["2026-01-31", "2026-02-28"],
  ])("clamps monthly anchor %s to %s when needed", (start, expected) => {
    expect(getOccurrenceDate(Interval.MONTHLY, date(start), 1)).toEqual(date(expected));
  });

  it("uses the original monthly anchor after a clamped month", () => {
    const start = date("2026-01-31");

    expect(getOccurrenceDate(Interval.MONTHLY, start, 1)).toEqual(date("2026-02-28"));
    expect(getOccurrenceDate(Interval.MONTHLY, start, 2)).toEqual(date("2026-03-31"));
  });

  it("clamps monthly anchors to April 30 without drifting", () => {
    const start = date("2026-01-31");

    expect(getOccurrenceDate(Interval.MONTHLY, start, 3)).toEqual(date("2026-04-30"));
    expect(getOccurrenceDate(Interval.MONTHLY, start, 4)).toEqual(date("2026-05-31"));
  });

  it("clamps a February 29 yearly anchor only in non-leap years", () => {
    const start = date("2024-02-29");

    expect(getOccurrenceDate(Interval.YEARLY, start, 1)).toEqual(date("2025-02-28"));
    expect(getOccurrenceDate(Interval.YEARLY, start, 2)).toEqual(date("2026-02-28"));
    expect(getOccurrenceDate(Interval.YEARLY, start, 4)).toEqual(date("2028-02-29"));
  });

  it("handles year changes and normalizes the result to UTC midnight", () => {
    const start = new Date("2026-12-31T18:00:00-05:00");

    expect(getOccurrenceDate(Interval.MONTHLY, start, 1)).toEqual(date("2027-01-31"));
    expect(getOccurrenceDate(Interval.YEARLY, start, 1)).toEqual(date("2027-12-31"));
  });

  it("returns the original UTC-normalized date for occurrence index zero", () => {
    const start = new Date("2026-01-31T23:30:00-05:00");

    expect(getOccurrenceDate(Interval.MONTHLY, start, 0)).toEqual(date("2026-02-01"));
    expect(start.toISOString()).toBe("2026-02-01T04:30:00.000Z");
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid occurrence index %s",
    (index) => {
      expect(() => getOccurrenceDate(Interval.DAILY, date("2026-01-01"), index)).toThrow(
        "occurrenceIndex must be a non-negative integer"
      );
    }
  );

  it("rejects an invalid start date", () => {
    expect(() => getOccurrenceDate(Interval.MONTHLY, new Date("invalid"), 0)).toThrow(
      "startDate must be a valid date"
    );
  });
});

describe("getEffectiveAmount", () => {
  it("returns the base amount for a non-variable item", () => {
    expect(
      getEffectiveAmount(
        { amount: 100, isVariable: false, priceAdjustments: [] },
        date("2026-06-01")
      )
    ).toBe(100);
  });

  it("uses the latest adjustment effective on the date", () => {
    const item = {
      amount: 100,
      isVariable: true,
      priceAdjustments: [
        { amount: 110, startDate: date("2026-03-01") },
        { amount: 120, startDate: date("2026-06-01") },
      ],
    };

    expect(getEffectiveAmount(item, date("2026-02-28"))).toBe(100);
    expect(getEffectiveAmount(item, date("2026-03-15"))).toBe(110);
    expect(getEffectiveAmount(item, date("2026-06-01"))).toBe(120);
  });

  it("preserves the existing sorted-adjustment behavior", () => {
    const item = {
      amount: 100,
      isVariable: true,
      priceAdjustments: [
        { amount: 120, startDate: date("2026-06-01") },
        { amount: 110, startDate: date("2026-03-01") },
      ],
    };

    expect(getEffectiveAmount(item, date("2026-04-01"))).toBe(100);
  });
});

describe("occurrenceKey", () => {
  it("is deterministic for the same source and UTC date", () => {
    expect(
      occurrenceKey("PLANNED_EXPENSE", "expense-1", date("2026-10-26"))
    ).toBe("PLANNED_EXPENSE:expense-1:2026-10-26");
    expect(
      occurrenceKey("PLANNED_EXPENSE", "expense-1", new Date("2026-10-26T23:59:59Z"))
    ).toBe("PLANNED_EXPENSE:expense-1:2026-10-26");
  });

  it("normalizes offset dates before generating the key", () => {
    expect(
      occurrenceKey(
        "INCOME_SOURCE",
        "income-1",
        new Date("2026-10-26T23:00:00-05:00")
      )
    ).toBe("INCOME_SOURCE:income-1:2026-10-27");
  });

  it("distinguishes source types and source ids", () => {
    const scheduledDate = date("2026-10-26");

    expect(occurrenceKey("INCOME_SOURCE", "same-id", scheduledDate)).not.toBe(
      occurrenceKey("PLANNED_EXPENSE", "same-id", scheduledDate)
    );
    expect(occurrenceKey("INCOME_SOURCE", "income-1", scheduledDate)).not.toBe(
      occurrenceKey("INCOME_SOURCE", "income-2", scheduledDate)
    );
  });
});
