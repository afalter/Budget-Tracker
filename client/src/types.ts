export enum Interval {
  ONE_TIME = "ONE_TIME",
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  BIWEEKLY = "BIWEEKLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  YEARLY = "YEARLY",
}

export interface Account {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BalanceSnapshot {
  id: string;
  amount: number;
  date: string;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  interval: Interval;
  startDate: string;
  active: boolean;
}

export interface IncomingTransfer {
  id: string;
  name: string;
  amount: number;
  interval: Interval;
  startDate: string;
  endDate?: string;
  active: boolean;
  sourceAccountName: string;
}

export interface PriceAdjustment {
  id: string;
  amount: number;
  startDate: string;
  note?: string;
}

export interface PlannedExpense {
  id: string;
  name: string;
  amount: number;
  interval: Interval;
  startDate: string;
  endDate?: string;
  active: boolean;
  category?: string;
  isVariable: boolean;
  isTransfer: boolean;
  transferToAccountId?: string;
  priceAdjustments: PriceAdjustment[];
}

export interface ActualSpend {
  id: string;
  date: string;
  amount: number;
  note?: string;
  category?: string;
  forecastExpenseId?: string;
  forecastExpense?: { id: string; name: string; category?: string };
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectionEvent {
  id?: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  category?: string;
  isActual?: boolean;
  isTransfer?: boolean;
}

export interface CategoryColor {
  name: string;
  color: string;
  description: string;
}

export interface ProjectionDay {
  date: string;
  balance: number;
  events: ProjectionEvent[];
}

export interface ProjectionApiError {
  code:
    | "NO_HISTORICAL_SNAPSHOT"
    | "NO_BALANCE_SNAPSHOT"
    | "OCCURRENCE_PROCESSING_FAILED"
    | string;
}

export interface Override {
  id: string;
  type: "income" | "expense";
  active: boolean;
}

export type DateRange =
  | { kind: "preset"; days: number }
  | { kind: "custom"; startDate: string; endDate: string };

export type ChartType = "projection" | "spending" | "income-vs-expenses" | "cash-flow" | "expense-trend";

export interface ChartFullscreenOptions {
  height: number;
  showBrush?: boolean;
  brushIndex?: [number, number];
  onBrushChange?: (range: [number, number]) => void;
  chartStyle?: "area" | "line";
  showGrid?: boolean;
  barLayout?: "grouped" | "stacked";
  pieStyle?: "donut" | "full";
  trendMode?: "stacked" | "lines";
}
