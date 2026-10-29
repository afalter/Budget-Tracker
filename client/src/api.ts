import type {
  Account,
  ActualSpend,
  BalanceSnapshot,
  IncomeSource,
  IncomingTransfer,
  PlannedExpense,
  PriceAdjustment,
  ProjectionDay,
  Override,
  CategoryColor,
  ProjectionApiError,
} from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code?: string) {
    super(code || `API error ${status}`);
    this.name = "ApiError";
  }
}

const BASE = "";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    let code: string | undefined;
    try {
      code = (JSON.parse(text) as ProjectionApiError).code;
    } catch {
      // Keep a stable generic error for non-JSON responses.
    }
    throw new ApiError(res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Accounts
export function getAccounts(): Promise<Account[]> {
  return request<Account[]>("/api/accounts");
}

export function createAccount(name: string): Promise<Account> {
  return request<Account>("/api/accounts", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateAccount(id: string, name: string): Promise<Account> {
  return request<Account>(`/api/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export function deleteAccount(id: string): Promise<void> {
  return request<void>(`/api/accounts/${id}`, { method: "DELETE" });
}

// Balance
export function getBalance(accountId: string): Promise<BalanceSnapshot | null> {
  return request<BalanceSnapshot | null>(`/api/accounts/${accountId}/balance`);
}

export function setBalance(accountId: string, amount: number): Promise<BalanceSnapshot> {
  return request<BalanceSnapshot>(`/api/accounts/${accountId}/balance`, {
    method: "POST",
    body: JSON.stringify({ amount, date: new Date().toISOString().split("T")[0] }),
  });
}

// Income
export function getIncome(accountId: string): Promise<IncomeSource[]> {
  return request<IncomeSource[]>(`/api/accounts/${accountId}/income`);
}

export function getIncomingTransfers(accountId: string): Promise<IncomingTransfer[]> {
  return request<IncomingTransfer[]>(`/api/accounts/${accountId}/income/transfers`);
}

export function createIncome(
  accountId: string,
  data: Omit<IncomeSource, "id">
): Promise<IncomeSource> {
  return request<IncomeSource>(`/api/accounts/${accountId}/income`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateIncome(
  accountId: string,
  id: string,
  data: Partial<IncomeSource>
): Promise<IncomeSource> {
  return request<IncomeSource>(`/api/accounts/${accountId}/income/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteIncome(accountId: string, id: string): Promise<void> {
  return request<void>(`/api/accounts/${accountId}/income/${id}`, { method: "DELETE" });
}

export function toggleIncome(accountId: string, id: string): Promise<IncomeSource> {
  return request<IncomeSource>(`/api/accounts/${accountId}/income/${id}/toggle`, {
    method: "PATCH",
  });
}

// Expenses
export function getExpenses(accountId: string): Promise<PlannedExpense[]> {
  return request<PlannedExpense[]>(`/api/accounts/${accountId}/expenses`);
}

export function createExpense(
  accountId: string,
  data: Omit<PlannedExpense, "id">
): Promise<PlannedExpense> {
  return request<PlannedExpense>(`/api/accounts/${accountId}/expenses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateExpense(
  accountId: string,
  id: string,
  data: Partial<PlannedExpense>
): Promise<PlannedExpense> {
  return request<PlannedExpense>(`/api/accounts/${accountId}/expenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteExpense(accountId: string, id: string): Promise<void> {
  return request<void>(`/api/accounts/${accountId}/expenses/${id}`, { method: "DELETE" });
}

export function toggleExpense(accountId: string, id: string): Promise<PlannedExpense> {
  return request<PlannedExpense>(`/api/accounts/${accountId}/expenses/${id}/toggle`, {
    method: "PATCH",
  });
}

// Price Adjustments
export function getPriceAdjustments(
  accountId: string,
  expenseId: string
): Promise<PriceAdjustment[]> {
  return request<PriceAdjustment[]>(
    `/api/accounts/${accountId}/expenses/${expenseId}/prices`
  );
}

export function addPriceAdjustment(
  accountId: string,
  expenseId: string,
  data: { amount: number; startDate: string; note?: string }
): Promise<PriceAdjustment> {
  return request<PriceAdjustment>(
    `/api/accounts/${accountId}/expenses/${expenseId}/prices`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export function updatePriceAdjustment(
  accountId: string,
  expenseId: string,
  priceId: string,
  data: { amount?: number; startDate?: string; note?: string }
): Promise<PriceAdjustment> {
  return request<PriceAdjustment>(
    `/api/accounts/${accountId}/expenses/${expenseId}/prices/${priceId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

export function deletePriceAdjustment(
  accountId: string,
  expenseId: string,
  priceId: string
): Promise<void> {
  return request<void>(
    `/api/accounts/${accountId}/expenses/${expenseId}/prices/${priceId}`,
    { method: "DELETE" }
  );
}

// Actual Spending
export function getActuals(accountId: string): Promise<ActualSpend[]> {
  return request<ActualSpend[]>(`/api/accounts/${accountId}/actuals`);
}

export function createActual(
  accountId: string,
  data: { date: string; amount: number; note?: string; category?: string; forecastExpenseId?: string }
): Promise<ActualSpend> {
  return request<ActualSpend>(`/api/accounts/${accountId}/actuals`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateActual(
  accountId: string,
  id: string,
  data: Partial<{ date: string; amount: number; note: string; category: string; forecastExpenseId: string }>
): Promise<ActualSpend> {
  return request<ActualSpend>(`/api/accounts/${accountId}/actuals/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteActual(accountId: string, id: string): Promise<void> {
  return request<void>(`/api/accounts/${accountId}/actuals/${id}`, { method: "DELETE" });
}

export function updateTransaction(
  accountId: string,
  id: string,
  data: { amount?: number; note?: string; occurredAt?: string }
): Promise<void> {
  return request<void>(`/api/accounts/${accountId}/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteTransaction(accountId: string, id: string): Promise<void> {
  return request<void>(`/api/accounts/${accountId}/transactions/${id}`, { method: "DELETE" });
}

// Categories (global, not account-scoped)
export function getCategories(): Promise<CategoryColor[]> {
  return request<CategoryColor[]>("/api/categories");
}

export function createCategory(data: { name: string; color?: string; description?: string }): Promise<CategoryColor> {
  return request<CategoryColor>("/api/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(
  name: string,
  data: { color?: string; description?: string; newName?: string }
): Promise<CategoryColor> {
  return request<CategoryColor>(`/api/categories/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(name: string): Promise<void> {
  return request<void>(`/api/categories/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

// Spreadsheet
export function exportSpreadsheet(accountId: string): Promise<Blob> {
  return fetch(`${BASE}/api/accounts/${accountId}/spreadsheet/export`).then((res) => {
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  });
}

export async function importSpreadsheet(
  accountId: string,
  file: File
): Promise<{ message: string; results: Record<string, unknown> }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/accounts/${accountId}/spreadsheet/import`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import failed: ${text}`);
  }
  return res.json();
}

// Projections
export function getProjections(
  accountId: string,
  range: { startDate: string; endDate: string } | { days: number },
  overrides?: Override[]
): Promise<ProjectionDay[]> {
  const params = new URLSearchParams();
  if ("days" in range) {
    params.set("days", String(range.days));
  } else {
    params.set("startDate", range.startDate);
    params.set("endDate", range.endDate);
  }
  if (overrides && overrides.length > 0) {
    params.set("overrides", JSON.stringify(overrides));
  }
  return request<ProjectionDay[]>(
    `/api/accounts/${accountId}/projections?${params.toString()}`
  );
}
