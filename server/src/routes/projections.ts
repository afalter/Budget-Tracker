import { Router, Request, Response } from "express";
import { Interval, Prisma, PrismaClient } from "@prisma/client";
import prisma from "../lib/prisma";
import { getEffectiveAmount, matchesInterval } from "../lib/projectionEngine";
import { processDueOccurrencesForAccount } from "../lib/occurrenceProcessing";

const router = Router({ mergeParams: true });

interface ProjectionEvent {
  id?: string;
  type: "income" | "expense";
  name: string;
  amount: number;
  category?: string;
  isActual?: boolean;
  forecastExpenseId?: string;
  incomeSourceId?: string;
  isTransfer?: boolean;
}

interface ProjectionDay {
  date: string;
  balance: number;
  events: ProjectionEvent[];
}

interface Override {
  id: string;
  active: boolean;
}

interface ItemWithAdjustments {
  id: string;
  interval: Interval;
  startDate: Date;
  endDate?: Date | null;
  active: boolean;
  name: string;
  amount: number;
  category: string | null;
  isVariable: boolean;
  isTransfer?: boolean;
  priceAdjustments: { amount: number; startDate: Date }[];
  sourceAccountName?: string;
}

interface ActualForDay {
  amount: number;
  name: string;
  category: string | null;
  forecastExpenseId: string | null;
}

interface ActualTransactionForDay {
  id?: string;
  type: "INCOME" | "EXPENSE";
  amount: number;
  name: string;
  category: string | null;
  affectsBalance: boolean;
  forecastExpenseId?: string;
  incomeSourceId?: string;
}

interface MaterializedActualTransaction {
  id?: string;
  type: "INCOME" | "EXPENSE";
  amount: number | Prisma.Decimal;
  occurredAt: Date;
  deletedAt: Date | null;
  note: string | null;
  category: string | null;
  occurrence: {
    status: string;
    dueDate: Date;
    plannedExpenseId: string | null;
    nameSnapshot: string;
    categorySnapshot: string | null;
    incomeSourceId?: string | null;
  } | null;
}

export function buildActualTransactionProjectionData(
  transactions: MaterializedActualTransaction[],
  balanceStartDate: Date,
  includeStartDateTransactions = false
): {
  actualTransactionsByDate: Map<string, ActualTransactionForDay[]>;
  coveredExpensesByDate: Map<string, Set<string>>;
} {
  const actualTransactionsByDate = new Map<string, ActualTransactionForDay[]>();
  const coveredExpensesByDate = new Map<string, Set<string>>();
  const balanceStartKey = balanceStartDate.toISOString().split("T")[0];

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.occurrence && transaction.occurrence.status !== "COMPLETED") continue;
    const occurredDateKey = transaction.occurredAt.toISOString().split("T")[0];
    const actualEvent: ActualTransactionForDay = {
      type: transaction.type,
      amount: Number(transaction.amount),
      name: transaction.note || transaction.occurrence?.nameSnapshot || "Actual transaction",
      category: transaction.category || transaction.occurrence?.categorySnapshot || null,
      affectsBalance: includeStartDateTransactions
        ? occurredDateKey >= balanceStartKey
        : occurredDateKey > balanceStartKey,
    };
    if (transaction.id) actualEvent.id = transaction.id;
    if (transaction.occurrence?.incomeSourceId) {
      actualEvent.incomeSourceId = transaction.occurrence.incomeSourceId;
    }
    const events = actualTransactionsByDate.get(occurredDateKey);
    if (events) events.push(actualEvent);
    else actualTransactionsByDate.set(occurredDateKey, [actualEvent]);

    const occurrence = transaction.occurrence;
    if (!occurrence || occurrence.status !== "COMPLETED" || !occurrence.plannedExpenseId) continue;
    const dueDateKey = occurrence.dueDate.toISOString().split("T")[0];
    const covered = coveredExpensesByDate.get(dueDateKey) ?? new Set<string>();
    covered.add(occurrence.plannedExpenseId);
    coveredExpensesByDate.set(dueDateKey, covered);
  }

  return { actualTransactionsByDate, coveredExpensesByDate };
}

export async function calculateBalanceAt(
  db: PrismaClient,
  accountId: string,
  snapshot: { amount: number; date: Date },
  throughExclusive: Date
): Promise<number> {
  const snapshotDate = new Date(Date.UTC(
    snapshot.date.getUTCFullYear(),
    snapshot.date.getUTCMonth(),
    snapshot.date.getUTCDate(),
  ));
  const fromDate = new Date(snapshotDate);
  fromDate.setUTCDate(fromDate.getUTCDate() + 1);
  const [transactions, actualSpends] = await Promise.all([
    db.actualTransaction.findMany({
      where: {
        accountId,
        deletedAt: null,
        occurredAt: { gte: fromDate, lt: throughExclusive },
      },
      select: { type: true, amount: true },
    }),
    db.actualSpend.findMany({
      where: {
        accountId,
        date: { gte: fromDate, lt: throughExclusive },
      },
      select: { amount: true },
    }),
  ]);

  let balance = new Prisma.Decimal(snapshot.amount);
  for (const transaction of transactions) {
    balance = transaction.type === "INCOME"
      ? balance.add(transaction.amount)
      : balance.sub(transaction.amount);
  }
  for (const actualSpend of actualSpends) {
    balance = balance.sub(actualSpend.amount);
  }
  return balance.toNumber();
}

export async function calculateCurrentBalance(
  db: PrismaClient,
  accountId: string,
  snapshot: { amount: number; date: Date },
  today: Date
): Promise<number> {
  const throughExclusive = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + 1,
  ));
  return calculateBalanceAt(db, accountId, snapshot, throughExclusive);
}

export function isHistoricalWindow(windowStart: Date, todayUTC: Date): boolean {
  return windowStart < todayUTC;
}

export function applyDay(
  currentDate: Date,
  runningBalance: number,
  effectiveIncome: { id?: string; interval: Interval; startDate: Date; active: boolean; name: string; amount: number }[],
  effectiveExpenses: ItemWithAdjustments[],
  incomingTransfers: ItemWithAdjustments[],
  actualsForDay: ActualForDay[],
  coveredExpenseIds = new Set<string>(),
  actualTransactionsForDay: ActualTransactionForDay[] = []
): { balance: number; events: ProjectionEvent[] } {
  const events: ProjectionEvent[] = [];
  let balance = runningBalance;
  const coveredIncomeSourceIds = new Set(
    actualTransactionsForDay
      .filter((actual) => actual.type === "INCOME" && actual.incomeSourceId)
      .map((actual) => actual.incomeSourceId!)
  );

  // Regular income
  for (const source of effectiveIncome) {
    if (!source.active) continue;
    if (source.id && coveredIncomeSourceIds.has(source.id)) continue;
    if (matchesInterval(source.interval, source.startDate, currentDate)) {
      const event: ProjectionEvent = { type: "income", name: source.name, amount: source.amount };
      if (source.id) event.incomeSourceId = source.id;
      events.push(event);
      balance += source.amount;
    }
  }

  // Incoming transfers (from other accounts)
  const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for (const transfer of incomingTransfers) {
    if (!transfer.active) continue;
    if (transfer.endDate && currentDate > transfer.endDate) continue;
    if (matchesInterval(transfer.interval, transfer.startDate, currentDate)) {
      const amount = getEffectiveAmount(transfer, currentDate);
      const mon = MONTH_ABBR[currentDate.getUTCMonth()];
      const eventName = `${transfer.name}-${mon}`;
      const categoryName = transfer.sourceAccountName
        ? `Transfer from ${transfer.sourceAccountName}`
        : "Transfer";
      events.push({ type: "income", name: eventName, amount, category: categoryName });
      balance += amount;
    }
  }

  // Actual spends for this day — these replace linked forecast expenses
  const coveredForecastIds = new Set<string>();
  for (const actual of actualsForDay) {
    if (actual.forecastExpenseId) {
      coveredForecastIds.add(actual.forecastExpenseId);
    }
    const event: ProjectionEvent = {
      type: "expense",
      name: actual.name,
      amount: actual.amount,
      isActual: true,
    };
    if (actual.forecastExpenseId) event.forecastExpenseId = actual.forecastExpenseId;
    if (actual.category) event.category = actual.category;
    events.push(event);
    balance -= actual.amount;
  }

  // Actual transactions are always displayed on their stored occurredAt date.
  // Transactions through today are already included in the start balance.
  for (const actual of actualTransactionsForDay) {
    const event: ProjectionEvent = {
      type: actual.type === "INCOME" ? "income" : "expense",
      name: actual.name,
      amount: actual.amount,
      isActual: true,
    };
    if (actual.id) event.id = actual.id;
    if (actual.incomeSourceId) event.incomeSourceId = actual.incomeSourceId;
    if (actual.category) event.category = actual.category;
    events.push(event);
    if (actual.affectsBalance) {
      balance = actual.type === "INCOME"
        ? balance + actual.amount
        : balance - actual.amount;
    }
  }

  // Forecast expenses — skip any covered by actuals
  for (const expense of effectiveExpenses) {
    if (!expense.active) continue;
    if (expense.endDate && currentDate > expense.endDate) continue;
    if (matchesInterval(expense.interval, expense.startDate, currentDate)) {
      if (coveredForecastIds.has(expense.id) || coveredExpenseIds.has(expense.id)) continue;
      const amount = getEffectiveAmount(expense, currentDate);
      const event: ProjectionEvent = {
        type: "expense",
        name: expense.name,
        amount,
        forecastExpenseId: expense.id,
      };
      if (expense.category) event.category = expense.category;
      if (expense.isTransfer) event.isTransfer = true;
      events.push(event);
      balance -= amount;
    }
  }

  return { balance: Math.round(balance * 100) / 100, events };
}

// GET /api/accounts/:accountId/projections
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    try {
      await processDueOccurrencesForAccount(prisma, accountId);
    } catch (error) {
      console.error("Failed to process due occurrences:", error);
      res.status(503).json({
        code: "OCCURRENCE_PROCESSING_FAILED",
        error: "Failed to process due occurrences",
      });
      return;
    }

    let overrides: Override[] = [];
    if (req.query.overrides) {
      try {
        overrides = JSON.parse(req.query.overrides as string);
      } catch {
        res.status(400).json({ error: "Invalid overrides JSON" });
        return;
      }
    }

    const overrideMap = new Map<string, boolean>();
    for (const o of overrides) {
      overrideMap.set(o.id, o.active);
    }

    // Determine the date window
    const today = new Date();
    const todayUTC = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    );

    let windowStart: Date;
    let windowEnd: Date;

    if (req.query.startDate && req.query.endDate) {
      windowStart = new Date(req.query.startDate as string + "T00:00:00Z");
      windowEnd = new Date(req.query.endDate as string + "T00:00:00Z");
    } else {
      const days = Math.min(parseInt(req.query.days as string) || 90, 365 * 2);
      windowStart = todayUTC;
      windowEnd = new Date(todayUTC);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + days - 1);
    }

    // Cap window to 2 years max
    const maxEnd = new Date(windowStart);
    maxEnd.setUTCDate(maxEnd.getUTCDate() + 365 * 2);
    if (windowEnd > maxEnd) windowEnd = maxEnd;

    // Fetch account-scoped data + incoming transfers + actuals
    const historical = isHistoricalWindow(windowStart, todayUTC);
    const historicalSnapshotEnd = new Date(windowStart);
    historicalSnapshotEnd.setUTCDate(historicalSnapshotEnd.getUTCDate() + 1);
    const balanceSnapshot = await prisma.balanceSnapshot.findFirst({
      where: historical
        ? { accountId, date: { lt: historicalSnapshotEnd } }
        : { accountId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    if (!balanceSnapshot) {
      res.status(409).json({
        code: historical ? "NO_HISTORICAL_SNAPSHOT" : "NO_BALANCE_SNAPSHOT",
      });
      return;
    }
    let runningBalance = balanceSnapshot
      ? historical
        ? await calculateBalanceAt(prisma, accountId, balanceSnapshot, windowStart)
        : await calculateCurrentBalance(prisma, accountId, balanceSnapshot, todayUTC)
      : 0;

    const [incomeSources, expenses, rawTransfers, actuals] = await Promise.all([
      prisma.incomeSource.findMany({ where: { accountId } }),
      prisma.plannedExpense.findMany({
        where: { accountId },
        include: { priceAdjustments: { orderBy: { startDate: "asc" } } },
      }),
      prisma.plannedExpense.findMany({
        where: {
          transferToAccountId: accountId,
          isTransfer: true,
          active: true,
          NOT: { accountId },
        },
        include: {
          priceAdjustments: { orderBy: { startDate: "asc" } },
          account: { select: { name: true } },
        },
      }),
      prisma.actualSpend.findMany({
        where: { accountId },
        include: { forecastExpense: { select: { id: true, name: true } } },
      }),
    ]);

    const materializedExpenses = await prisma.actualTransaction.findMany({
      where: { accountId, deletedAt: null },
      select: {
        id: true,
        type: true,
        amount: true,
        occurredAt: true,
        deletedAt: true,
        note: true,
        category: true,
        occurrence: {
          select: {
            status: true,
            dueDate: true,
            plannedExpenseId: true,
            nameSnapshot: true,
            categorySnapshot: true,
            incomeSourceId: true,
          },
        },
      },
    });
    const { actualTransactionsByDate, coveredExpensesByDate } = buildActualTransactionProjectionData(
      materializedExpenses,
      historical ? windowStart : todayUTC,
      historical,
    );

    // Build actuals map: "YYYY-MM-DD" → ActualForDay[]
    const actualsMap = new Map<string, ActualForDay[]>();
    for (const a of actuals) {
      const dateKey = a.date.toISOString().split("T")[0];
      const entry: ActualForDay = {
        amount: a.amount,
        name: a.note || (a.forecastExpense ? a.forecastExpense.name : "Actual spend"),
        category: a.category,
        forecastExpenseId: a.forecastExpenseId,
      };
      const list = actualsMap.get(dateKey);
      if (list) list.push(entry);
      else actualsMap.set(dateKey, [entry]);
    }

    const effectiveIncome = incomeSources.map((s) => ({
      ...s,
      active: overrideMap.has(s.id) ? overrideMap.get(s.id)! : s.active,
    }));

    const effectiveExpenses: ItemWithAdjustments[] = expenses.map((e) => ({
      ...e,
      active: overrideMap.has(e.id) ? overrideMap.get(e.id)! : e.active,
    }));

    const incomingTransfers: ItemWithAdjustments[] = rawTransfers.map((t) => {
      const srcName = (t as unknown as { account: { name: string } }).account.name;
      return {
        id: t.id,
        interval: t.interval,
        startDate: t.startDate,
        endDate: t.endDate,
        active: t.active,
        name: t.name,
        amount: t.amount,
        category: `Transfer from ${srcName}`,
        isVariable: t.isVariable,
        priceAdjustments: t.priceAdjustments,
        sourceAccountName: srcName,
      };
    });

    // If window starts after today, simulate from today to get correct starting balance
    if (windowStart > todayUTC) {
      const current = new Date(todayUTC);
      while (current < windowStart) {
        const dateKey = current.toISOString().split("T")[0];
        const actualsForDay = actualsMap.get(dateKey) || [];
        const coveredExpenseIds = coveredExpensesByDate.get(dateKey) ?? new Set<string>();
        const actualTransactionsForDay = actualTransactionsByDate.get(dateKey) || [];
        const result = applyDay(current, runningBalance, effectiveIncome, effectiveExpenses, incomingTransfers, actualsForDay, coveredExpenseIds, actualTransactionsForDay);
        runningBalance = result.balance;
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }

    // Generate projections for the visible window
    const projections: ProjectionDay[] = [];
    const current = new Date(windowStart);

    while (current <= windowEnd) {
      const dateKey = current.toISOString().split("T")[0];
      const actualsForDay = actualsMap.get(dateKey) || [];
      const coveredExpenseIds = coveredExpensesByDate.get(dateKey) ?? new Set<string>();
      const actualTransactionsForDay = actualTransactionsByDate.get(dateKey) || [];
      const result = applyDay(current, runningBalance, effectiveIncome, effectiveExpenses, incomingTransfers, actualsForDay, coveredExpenseIds, actualTransactionsForDay);
      runningBalance = result.balance;

      projections.push({
        date: current.toISOString().split("T")[0],
        balance: result.balance,
        events: result.events,
      });

      current.setUTCDate(current.getUTCDate() + 1);
    }

    res.json(projections);
  } catch (error) {
    console.error("Failed to compute projections:", error);
    res.status(500).json({ error: "Failed to compute projections" });
  }
});

export default router;
